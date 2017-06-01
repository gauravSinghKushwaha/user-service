Command :: nodemon .\src\web\index.js dev.properties db.properties


A nodejs express based rest module. Which will be used a  generic resource server to store infomratio in DB.

1) takes properties file as console input. you could give full path like d:\\abc\\xyz.properties Or only property file name like xyz.properties. In case of later it will look for file in resouces folder under config.
2) run the sever using cluster module, creates logs.cluster.childprocess many child process for handling rest requests.
3) Use basic auth for api caller authentication, use credentials given in properties file as of now.
4) use SHA-256 for one way hashing of sensitive information like password.
5) logs access logs in directory and file mentioned in config file.
6) log level of application logs could be controlled from config. e.g warn,debug,info,error
7) all the routes are mentioned in routes folder
8) server running port could be changed from config along with api's versioning.
9) fields like mobile number to be stored in encrypted form.

Usage :

1)

POST /river/v1/authenticate HTTP/1.1
Host: localhost:9090
Content-Type: application/json
Authorization: Basic cml2ZXItZWphYjoxQDMkNV43KjkpLSs=
Cache-Control: no-cache
Postman-Token: 788275fc-a7bc-0ebb-b285-53c9d8845f55

{
  "schema":"saravs",
  "table":"user",
  "cached":true,
  "attr":{
    "id":1,
    "user_id":"meuser",
    "name":"displayme",
    "password":"ad7878addf",
    "phonenumber":9999999999,
    "email":"abc@xyz.com",
    "age":18,
    "status":"active",
    "domain":"river.com",
    "resource":"android",
    "created_on":"dfdfd",
    "created_by":1,
    "update_on":"ssfdf",
    "updated_by":1
  },
  "conf":{
    "hashobjs":[
      "password"
    ],
    "encryptobjs":[
      "email",
      "phonenumber"
    ],"autogenerated":[
       "id"
    ]
  }
}

2)

GET /river/v1/password HTTP/1.1
Host: localhost:9090
Content-Type: application/json
Authorization: Basic cml2ZXItZWphYjoxQDMkNV43KjkpLSs=
Cache-Control: no-cache
Postman-Token: 1a0a293a-4ace-44f5-8d60-341aac1dbfa3
