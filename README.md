
# easy to use 

```
import (

	"github.com/pengzj/swift-client-go"
	"fmt"
  
)
func main()  {

	sdk.On("onChat", func(data []byte) {
		fmt.Println("recieve onChat : ", string(data))
	})

	client := sdk.NewClient()
	client.Connect("127.0.0.1", "3301")
	data := client.Request("user.login", []byte("hello, swift for golang"))
	fmt.Println("result: ", string(data))

}
```
