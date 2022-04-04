'use strict';

const {info, error, warn, debug} = require("./lib/log.js")
const {addressUserPart, isTelnum} = require("./lib/util.js")

/**
 * Возвращает функцию, отправляющую нотификацию на URI uri
 * для вызова cid клиента bnum от номера anum
 * @param {string} uri
 * @param {string} cid
 * @param {string} anum
 * @param {string} bnum
 * @returns {(event: string): string}
 */
const notifier = (uri, cid, anum, bnum) => event => {
    return HttpRequestAsync("POST", uri, {
        Mimetype: 'application/json',
        Timeout:  60,
        Body:     {
            "date_time":    Date.now(),
            "event":        event,
            "h323_conf_id": cid,
            "numberA":      anum,
            "sip_id":       bnum,
        },
    })
}

/**
 * Функция обработки входящего вызова. На вход получает объект параметров,
 * задаваемых правилом запуска функции для обработки входящего вызова.
 * Параметр должен содержать свойства:
 * - uri: string URI API-сервера для запроса правила обработки вызова
 * - target: string адрес (доменное имя или IP-адрес) целевого сервера
 *   для обработки перенаправленного вызова
 * @param {{ uri: string, target: string }} param
 * @returns
 */
function Main(param) {
    // Внутренний уникальный идентификатор вызова
    const cid = GenID()
    const apiURL = param.url
    const targetTrunk = param.target
    const bnum = addressUserPart(PendingRequestData('To'))
    const anum = addressUserPart(PendingRequestData('From'))
    if (!isTelnum(anum) || !isTelnum(bnum)) {
        error('telnum expected, got %s and %s', anum, bnum)
        RejectCall(SignalError(404, 'Not Found'))
        return
    }
    // Запрашиваем сервер
    HttpRequestAsync("POST", apiURL, {
        Mimetype: 'application/json',
        Body:     {
            "id": "1",
            "jsonrpc": "2.0",
            "method": "getControlCallFollowMe",
            "params": {
                "sip_id":       bnum,
                "numberA":      anum,
                "h323_conf_id": cid,
            }
        },
    })
    let redirectType, notifyURL, followmeStruct, dialoutTimeout
    // Максимальное время ожидания принятия решения об обработке вызова
    SetTimeout(90)
WaitForAPI:
    for (;;) {
        const evt = TimedReadInput()
        if (evt === null) {
            // Таймаут (нет ни ответа от сервера API, ни события завершения вызова)
            error('timed out waiting for API Server Response')
            RejectCall(SignalError(500, 'Server internal error'))
            return
        } else if (IsDisconnnectError(evt)) {
            // Входящий вызов оборвался (пришел CANCEL, или случился какой-либо таймаут)
            error('incoming call failed or cancelled, reason: %s', JSON.stringify(evt.Param))
            return
        } else if (IsAsyncResultEvent(evt)) {
            // API-сервер вернул ответ, или произошла ошибка
            if ('error' in evt.Param) {
                // ошибка (API-сервер недоступен, таймаут ответа, etc.)
                error('failed to get response from API server: %s', evt.Param.error)
                RejectCall(SignalError(500, 'Server internal error'))
                return
            } else if (evt.Param.result.StatusCode !== 200 || typeof evt.Param.result.Body !== 'object') {
                // API-сервер ответил кодом, отличным от "200 OK", либо в ответе нет данных
                error('invalid response from API server: %s', JSON.stringify(evt.Param))
                RejectCall(SignalError(500, 'Server internal error'))
                return
            } else {
                // выбираем данные из ответа
                dialoutTimeout = evt.Param.Body.result['timeout']
                redirectType   = evt.Param.Body.result['redirect_type']
                notifyURL      = evt.Param.Body.result['event_URL']
                followmeStruct = evt.Param.Body.result['followme_struct']
                break WaitForAPI
            }
        }
    }
    /**
     * Функция, отправляющая оповещение
     * @type {(event: string): void}
     */
    const notify = notifier(notifyURL, cid, anum, bnum)
    // Для целей MVP считаем, что redirect_type === 1 и нотификации не расширенные
    const {
        "ACTIVE":         action,
        "REDIRECT_NUMER": redirectNumber,
    } = followmeStruct[1][0]
    // был запрошен отбой вызова
    if (action === 'N') {
        // отбиваем вызов
        RejectCall(SignalError(486, 'Busy here'))
        // отправляем нотификацию
        notify({type: 'h'})
        return
    }
    // Стартовать задачу исходящего плеча вызова
    const egress = Spawn('Egress', {
        uri:      notifyURL,
        cid:      cid,
        anum:     anum,
        origBnum: bnum,
        From:     PendingRequestData('From'),
        To:       `sip:${redirectNumber}@${targetTrunk}`,
        bnun:     redirectNumber,
        timeout:  dialoutTimeout,
        'P-Asserted-Identity': PendingRequestData('P-Asserted-Identity'),
    })
    // Инициировать медиа-бридж. Функция StartBridge вернется,
    // когда вызов будет установлен, либо в случае ошибки
    try {
        StartBridge(egress)
    } catch (err) {
        // вызов не был установлен, произошла ошибка
        notify({type: 'h'})
        if (IsSignalError(err)) {
            info('call setup failed: %s', err.Message())
            RejectCall(err)
        } else {
            error('failed to setup bridge: %s', err.message)
            RejectCall(SignalError(500, 'Internal Server Error'))
        }
        return
    }
    // вызов был успешно установлен
    notify({type: 's'})
    while(IsConnected()) {
        const evt = ReadInput(-1)
        if (IsDisconnectEvent(evt)) {
            // вызов был разорван стороной A
            notify({type: 'h'})
            return
        } else if (IsBreakBridgeEvent(evt)) {
            // вызов был разорван стороной B
            notify({type: 'h'})
            return
        } else if (IsTaskStoppedEvent(evt)) {
            // задача Egress аварийно завершилась
            // завершить вызов, указав в поле Reason код 500
            Disconnect(500, 'Internal Server Error')
            notify({type: 'h'})
            return
        }
    }
}

/**
 * Функция-обработчик исходящего плеча вызова.
 * @param {object} param
 * @returns
 */
function Egress(param) {
    // после старта ожидаем параметры медиа-канала исходящего плеча
    const evt = ReadInput(5)
    if (!IsStartBridgeEvent(evt)) {
        error('expected start bridge event, got %v', evt)
        return
    }
    const {uri, cid, anum, origBnum, timeout} = param
    // Адрес вызова
    const dest = {
        'To':   param.From,
        'From': param.To,
        'P-Asserted-Identity': param['P-Asserted-Identity'],
    }
    /**
     * Функция, отправляющая оповещение
     * @type {(event: string): void}
     */
    const notify = notifier(uri, cid, anum, origBnum)
    // Инициируем вызов, используя параметры медиа-канала задачи
    // входяшего плеча
    StartBridgedCall(dest, evt)
    // оповещает об иницииации вызова
    notify({type: 'o'})
    // Устанавливаем максимально время дозвона
    SetTimeout(timeout)
Setup:
    while(true) {
        const evt = TimedReadInput()
        if (evt === null) {
            // timeout, дозвониться не получилось. Обрываем вызов,
            // входящее плечо получит ошибку в функции StartBridge
            Disconnect(487, 'Timed out')
            return
        } else if (IsCallCompletedEvent(evt)) {
            if (evt.Param !== null) {
                // вызов не установился, входящее плечо получило
                // ошибку в StartBridge
                error('call failed: %s', evt.Param)
                return
            }
            // вызов успешно установился
            break Setup
        }
    }
    // основной цикл обработки событий вызова
Dialog:
    while (IsConnected()) {
        const evt = ReadInput(-1)
        if (IsDisconnectEvent(evt)) {
            // вызов был разорван стороной B
            return
        } else if (IsBreakBridgeEvent(evt)) {
            // вызов был разорван стороной A
            return
        } else if (IsTaskStoppedEvent(evt)) {
            // задача Main аварийно завершилась
            // завершить вызов, указав в поле Reason код 500
            Disconnect(500, 'Internal Server Error')
            return
        }
    }
}

exports.Main = Main
exports.Egress = Egress
exports.expectCall = expectCall
exports.incomingCall = incomingCall