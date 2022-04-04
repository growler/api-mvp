# Установка

Установить приложение через configuration interface:

```
installapp "mvp-api" git git@github.com:growler/api-mockup.git origin/master
```

Создать целевой домен и пользователя, назначить приложение домену:

```
createdomain mvp.test.kube.itoolabs
createaccount pbx@mvp.test.kube.itoolabs
setaccountrights pbx@mvp.test.kube.itoolabs ["domainAdmin"]
setdomainappid mvp.test.kube.itoolabs "mvp-api"
```

Создать правило для запуска приложения:

```
createrule {
    src:    "0.0.0.0:0",
    dst:    "0.0.0.0:5060",
    account: "pbx",
    domain:  "mvp.test.kube.itoolabs",
    task:    "mvp-api",
    params:  {
        "uri":    "http://api-server.test.kube.itoolabs",
        "target": "trunk.test.kube.itoolabs"
    }
}
```
