
# easy to use 

```
    Swift.on("onChat", function (data) {
        console.log(data, (new Date()));
    })

    var client = Swift.newClient()
    client.connect("127.0.0.1", "3301")


    setTimeout(function () {
        //logic

        client.request("user.login", "hello, friday", function (data) {
            console.log(data, Date.now())
        })
        client.request("user.login", "hello, friday again", function (data) {
            console.log(data, Date.now())
        });

    }, 1000);
```