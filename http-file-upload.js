

        var port          = 3002;
        var userdir       = 'upload/';
        var chunksize     = 1024*1024;
        
        
        console.clear();
        title('http-file-upload');
        console.log('http-file-upload');
        console.log();
        require('dns').lookup(require('os').hostname(),{family:4},listen);
        
        
        var ws            = wsmod();
        
        var https         = require('https');
        var fs            = require('fs');
        var fsp           = fs.promises;
        
        
        createdir();
        
        var key,cert,cacert;
        setup();
        
        var server    = https.createServer({key,cert});
        
        server.on('request',request);
        server.on('upgrade',upgrade);
        server.on('listening',()=>console.log('http server listening - all interfaces, port '+port));
        server.on('error',console.error);
        
        
        var txt   = {};
        
        
  //:
  
  
        function request(req,res){
                                                                                console.log(req.url);
              switch(req.url){
              
                case '/'              : request.hello(req,res);         break;
                case '/hello'         : request.hello(req,res);         break;
                case '/worker.js'     : request.worker(req,res);        break;
                case '/cacert'        : request.cacert(req,res);        break;
                
                default               : request.notfound(req,res);      break;
                
              }//switch
              
        }//request
        
        request.hello=function(req,res){
        
              res.writeHead(200,{'Content-Type':'text/html'})
              res.end(txt.hello);
              
        }//hello
        
        request.worker=function(req,res){
        
              res.writeHead(200,{'Content-Type':'text/javascript'})
              res.end(txt.worker);
              
        }//fileupload
        
        request.cacert=function(req,res){
        
              res.setHeader('Content-Description','File Transfer');
              res.setHeader('Content-Type','application/octet-stream');
              res.setHeader('Content-Disposition','attachment; filename=cacert.cert.pem');
              res.end(cacert.trim());
              
        }//cacert
        
        request.notfound=function(req,res){
        
              res.writeHead(404,{'Content-Type':'text/html'})
              res.end('not found');
              
        }//notfound
        
        
  //:
  
  
        function upgrade(req,socket,head){
        
              var con     = ws.upgrade.server(req,socket,onmsg);
              
              function onmsg(payload,type,con){
              
                    var str     = payload.toString();
                    var json    = JSON.parse(str);
                    switch(json.type){
                    
                      case 'upload'             : upload(con,json);               break;
                      case 'download'           : download(con,json);             break;
                      case 'download-list'      : download.list(con,json);        break;
                      
                    }//switch
                    
              }//onmsg
              
        }//upgrade
        
  //:
  
        function upload(con,json){
        
              con.onrec    = rec;
              
              var fh;
              var name;
              var num;
              var ct;
              
              upload(json);
              
              async function upload(json){
              
                    ({name,num}   = json);
                    ct            = 0;
                                                                                console.log('upload',name,num);
                    fh    = await open(con,name,'w');
                    if(fh===false)return;
                    
                    con.send.json({type:'open'});
                    
              }//upload
              
              async function abort(){
                                                                                console.log('abort',name);
                    await fh.close();
                    del(con,name);
                    
              }//abort
              
              async function binary(buffer){
              
                    ct++;
                                                                                console.log(name,ct,'/',num);
                    var result    = await write(con,fh,buffer);
                    if(!result)return;
                    
                    if(ct===num){
                          fh.close();
                    }
                    
                    con.send.json({type:'progress'});
                    
              }//binary
              
              function rec(payload,type,con){
              
                    switch(type){
                    
                      case 'text'   :
                      
                          var str     = payload.toString();
                          var json    = JSON.parse(str);
                          switch(json.type){
                          
                            case 'upload'   : upload(json);   break;
                            case 'abort'    : abort();        break;
                            
                          }//switch
                          break;
                          
                      case 'binary'   :
                      
                          binary(payload);
                          break;
                          
                    }//switch
                    
              }//rec
              
        }//upload
        
        
  //:
  
  
        function download(con,json){
                                                                                console.log('download');
              con.onrec         = rec;
              
              var buffer        = Buffer.alloc(chunksize);
              var fn            = {};
              start(json);
              
              async function start(json){
              
                    fn.send         = send;
                    fn.abort        = abort;
                    var file        = json.file;
                                                                                console.log('start',file);
                    var size        = await filesize(con,file);
                    if(size===false)return;
                    
                    var num         = Math.ceil(size/chunksize);
                                                                                console.log(file,num);
                    var ct          = 0;
                    var flag        = false;
                    con.send.json({type:'start',size,num});
                    
                    var fh          = await open(con,file,'r');
                    if(fh===false)return;
                    
                    send();
                    
                    async function send(){
                    
                          ct++;
                                                                                console.log(file,ct,'/',num);
                          var buffer    = await read(con,fh);
                          if(!buffer)return;
                          
                          con.send.binary(buffer);
                          
                          if(ct===num){
                                fh.close();
                          }
                          
                    }//send
                    
                    function abort(){
                                                                                console.log('abort');
                          flag    = true;
                          fh.close();
                          
                    }//abort
                    
              }//start
              
              function rec(payload,type,con){
              
                    var str     = payload.toString();
                    var json    = JSON.parse(str);
                    switch(json.type){
                    
                      case 'download'   : start(json);      break;
                      case 'progress'   : fn.send();        break;
                      case 'abort'      : fn.abort();       break;
                      
                    }//switch
                    
              }//rec
              
        }//download
        
        
        download.list=async function(con,json){
                                                                                console.log('list');
              var files   = [];
              try{
                    var list    = await fsp.readdir(userdir,{withFileTypes:true});
              }
              catch(err){
                    var result    = false;
                    var msg       = err.toString();
              }
              if(result===false){
                    con.send.json({type:'error',msg});
                    return;
              }
              
              list.forEach(file=>{if(file.isFile())files.push(file.name)});
              con.send.json({type:'list',files});
              
        }//list
        
        
  //:
        async function open(con,file,mode){
        
              try{
                    var fh    = await fsp.open(userdir+file,mode);
              }
              
              catch(err){
                                                                                console.log(err);
                    var result    = false;
                    var msg       = err.toString();
              }
              
              if(result===false){
                    con.send.json({type:'error',msg});
                    return false;
              }
              
              return fh;
              
        }//open
        
        async function del(con,file){
        
              try{
                    await fsp.unlink(userdir+file);
              }
              
              catch(err){
                                                                                console.log(err);
                    var result    = false;
                    var msg       = err.toString();
              }
              
        }//del
        
        async function write(con,fh,buffer){
        
              try{
                    await fh.write(buffer);
              }
              
              catch(err){
                                                                                console.log(err);
                    var result    = false;
                    var msg       = err.toString();
              }
              
              if(result===false){
                    con.send.json({type:'error',msg});
                    return false;
              }
              
              return true;
              
        }//write
        
        async function filesize(con,file){
        
              try{
                    var stat    = await fsp.stat(userdir+file);
              }
              catch(err){
                                                                                console.log(err);
                    var result    = false;
                    var msg       = err.toString();
              }
              if(result===false){
                    con.send.json({type:'error',msg});
                    return false;
              }
              var size    = stat.size;
              return size;
              
        }//filesize
        
        
        async function read(con,fh){
        
              var buffer    = Buffer.alloc(chunksize);
              try{
                    var {bytesRead}   = await fh.read(buffer,{length:chunksize});
              }
              
              catch(err){
                                                                                console.log(err);
                    var result    = false;
                    var msg       = err.toString();
              }
              
              if(result===false){
                    con.send.json({type:'error',msg});
                    return;
              }
              
              if(bytesRead!==chunksize){
                    var buf2    = Buffer.alloc(bytesRead);
                    buffer.copy(buf2,0,0,bytesRead);
                    buffer   = buf2;
              }
              
              return buffer;
              
        }//read
        
        
  //:
  
  
        function listen(err,ip){
        
              server.listen(port);
              
              var nics    = require('os').networkInterfaces();
              for(var key in nics){
              
                    nics[key].forEach(o=>{
                    
                          if(o.family==='IPv4'){
                                console.log(o.address);
                          }
                          
                    });
                    
              }//for
              console.log();
              console.log('local ip : '+ip);
              console.log();
              
        }//listen
        
        function title(title){
        
              if(process.platform==='win32'){
                    process.title   = title;
              }else{
                    process.stdout.write('\x1b]2;'+title+'\x1b\x5c');
              }
              
        }//title
        
        function createdir(){
        
              var stat    = fs.statSync(userdir,{throwIfNoEntry:false});
              if(!stat){
                    fs.mkdirSync(userdir);
                    return;
              }
              if(!stat.isDirectory()){
                    console.error('invalid upload directory');
                    console.log(userdir);
                    console.log(__dirname);
                    process.exit();
              }
              
        }//createdir
        
        function setup(){
        
              key     = `
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAp1/aEck7k7OGlQe373+zEYiznlk0ORrg0UeyDGsULaGyIpG+
DW/1m6hga/y5LCObKNYhU2O2CYLOunzEXgFEhLq73zQ1rWNKdF/dE1P97lAeNmJ7
qapVHgmvqRR+M5JxGHHAr3cRS06WW2H4jJD4HWVuYhuww6igP6WhVWYoPn6sgDcW
E+HLI1DVwTxkA9J/poPSSdT/VEgvH2aOwA0h1KVa9l6DrC3E/tPo8D8NPyeViSRb
/HjyI3gXr74jQvq8+4fTcftNAtyhUXUhXvlryBGKZmARB1gXAiNCuXYK08I8PmhR
PwqVq15YYto9E4QYkfCZoJaNrztbFCfDl8yiVQIDAQABAoIBABhTaQlOuvbzj6rX
TVdksuzodlqcUme+TVB9YBZH9c3QA2jcz8d6LzMpXKI1P+B3aFSeEofhJRLqzQrz
mUKkYoX78dQ17Vs+5BJX4HSvr2dUg5+Z3qlBFU/hToN/c/wg24kW909JOd09FcNA
UPR1GWqEVG+z4JP/TRMTCoiz6UNzv4CRyWCF+iMkMQuWYXS3j+fd586eDElJGJEV
XujujNrAM/Qpj/ddLBy0vpHmiNNBJKJTWLVaCrk5zozss2uTxi3BWkwQ9w3lZyRp
ferWo0CNIDXwvA4ZX2ykKo9dKXwT1E3d/qo2LE8QGpzC5Gs50ZUUlnCGtp2qavd1
NR6WLmECgYEA1fTYqvC+BzX2/xaqAwZqfjBxvto29TjE8syrpB3S3vaS6lz/cw99
sb9l5b/KYAIsUVV3HbDIGCkHiCfochFD9ORLkuwSgijXrgEIKNyZHtL3pCq//hFq
H2k5hCmnXt3YhWF3ue3zSHyiDv/ps5n6YhI6HJyzD4XOM3z67EPnHA0CgYEAyEOu
Wd/G/w11rX9J+NcbSHUwUibrgCQFsuXohsCBVCr9zngqMfDqW5pbdc0CZ5RinC7y
bENI/4SLY7qZE3l/C8de3iSwgmw+K3blXoYtgFcp83s3hiiNvBeRGY1C8bL0bYZc
s5XfaTVjymXh6UlsIHnnJeDInMOd5FJW4zZ1ZWkCgYEAuGbCpvG+ljBopQo/lUPe
XMwb/MXOQCOhezHzbQtXR1t03BEzCVP8nUm85PsbzQuSbrceZrSKgGg8WZkrucQv
sc1hZUuZ2ByjZxD0m2MlhW+GiDNgLfWMZW4naEUOP7EsgCi1K8Ztu7fPZOYj4et/
5S6YbziPC33jbnT1PtR3R7ECgYBN2SF5hmfQ1eac3xJeTSAp9oQmK0L4uQgOFxlg
6Ixdr6iiDkw4xbIUkdhj3qHEqgX7OLS8KRvDWD7nMa43x87/QS07pX+H85PnSXy4
VehyL2/7WjanTDRsnaymBiez1SD3Qnfex6/lMf/sudYr3YLOzRRxwQO7DL/f9bIY
+R6BoQKBgFJN52moK6gfRCuTfqhihMy0O9CJCYIQm8tSMCrLD53DtoiMTuP1LDFu
5r3/rrCl5dRcb33nWz76hggtxpJo4H5DqLjoZlbajWxee5fSwqiBgWN2WNfFeui4
2DLyPhNkj/odVDub9Jxc8RoKK+D89b4/2jM955IiExkWb8MItV0E
-----END RSA PRIVATE KEY-----
`;

              cert    = `
Certificate:
    Data:
        Version: 3 (0x2)
        Serial Number: 4096 (0x1000)
    Signature Algorithm: sha256WithRSAEncryption
        Issuer: CN=tst-root-ca
        Validity
            Not Before: Aug 14 09:30:07 2022 GMT
            Not After : Dec 30 09:30:07 2049 GMT
        Subject: CN=tst-server
        Subject Public Key Info:
            Public Key Algorithm: rsaEncryption
                Public-Key: (2048 bit)
                Modulus:
                    00:a7:5f:da:11:c9:3b:93:b3:86:95:07:b7:ef:7f:
                    b3:11:88:b3:9e:59:34:39:1a:e0:d1:47:b2:0c:6b:
                    14:2d:a1:b2:22:91:be:0d:6f:f5:9b:a8:60:6b:fc:
                    b9:2c:23:9b:28:d6:21:53:63:b6:09:82:ce:ba:7c:
                    c4:5e:01:44:84:ba:bb:df:34:35:ad:63:4a:74:5f:
                    dd:13:53:fd:ee:50:1e:36:62:7b:a9:aa:55:1e:09:
                    af:a9:14:7e:33:92:71:18:71:c0:af:77:11:4b:4e:
                    96:5b:61:f8:8c:90:f8:1d:65:6e:62:1b:b0:c3:a8:
                    a0:3f:a5:a1:55:66:28:3e:7e:ac:80:37:16:13:e1:
                    cb:23:50:d5:c1:3c:64:03:d2:7f:a6:83:d2:49:d4:
                    ff:54:48:2f:1f:66:8e:c0:0d:21:d4:a5:5a:f6:5e:
                    83:ac:2d:c4:fe:d3:e8:f0:3f:0d:3f:27:95:89:24:
                    5b:fc:78:f2:23:78:17:af:be:23:42:fa:bc:fb:87:
                    d3:71:fb:4d:02:dc:a1:51:75:21:5e:f9:6b:c8:11:
                    8a:66:60:11:07:58:17:02:23:42:b9:76:0a:d3:c2:
                    3c:3e:68:51:3f:0a:95:ab:5e:58:62:da:3d:13:84:
                    18:91:f0:99:a0:96:8d:af:3b:5b:14:27:c3:97:cc:
                    a2:55
                Exponent: 65537 (0x10001)
        X509v3 extensions:
            X509v3 Basic Constraints: critical
                CA:FALSE
            X509v3 Key Usage: critical
                Digital Signature, Non Repudiation, Key Encipherment, Key Agreement
            X509v3 Extended Key Usage: critical
                TLS Web Server Authentication
            X509v3 Subject Key Identifier:
                3E:94:90:A9:2D:D7:71:A3:19:79:81:19:08:EE:CB:4A:AB:16:20:07
            X509v3 Authority Key Identifier:
                keyid:4B:0D:7A:26:6B:7A:A1:9E:EB:98:19:27:77:42:D0:BB:D0:A1:57:16
                DirName:/CN=tst-root-ca
                serial:EA:41:A9:B3:0F:FF:81:95
                
            X509v3 Subject Alternative Name:
                DNS:localhost, IP Address:127.0.0.1, IP Address:127.0.0.2, DNS:tst-server
    Signature Algorithm: sha256WithRSAEncryption
         93:ea:dc:4a:9c:3d:cb:df:bf:8a:9b:b9:22:40:21:c0:b1:77:
         20:31:d9:fc:ae:b1:41:bf:ca:58:52:aa:be:55:37:d4:f1:f4:
         4e:7b:2d:38:47:7c:63:2a:9f:36:d0:73:9c:7e:10:3b:8d:81:
         21:7e:10:d1:99:c0:4c:15:b4:79:66:4f:94:41:7f:15:72:3e:
         19:52:04:59:14:1d:a7:e2:04:36:60:7a:cc:ee:82:2a:46:82:
         7f:cc:90:ba:b0:d2:a4:eb:93:0b:0c:f6:ab:82:d0:90:36:3c:
         6c:04:74:6d:43:e9:ed:a6:3b:dd:e9:34:b7:a4:65:11:95:ba:
         ca:ef:67:7a:16:89:39:49:a8:9c:64:44:14:ba:26:8f:a6:37:
         e1:37:f4:0d:36:f8:39:cc:4e:a9:49:f6:21:33:e3:f5:b1:12:
         de:7e:66:eb:09:7c:41:b7:09:4c:d5:6a:04:65:29:13:07:d3:
         bb:13:4e:56:b2:28:f2:ba:c6:a7:ac:ba:92:68:06:40:49:dd:
         4a:43:85:f5:6b:87:85:7a:cf:3f:38:78:85:58:e7:80:fd:72:
         d0:0c:f8:92:f2:16:1f:33:32:ed:44:ca:3c:f3:94:be:a2:b4:
         a0:92:7a:2d:a5:59:5a:1d:be:f3:be:06:69:04:a8:ba:a9:19:
         7a:eb:8b:9b
-----BEGIN CERTIFICATE-----
MIIDdjCCAl6gAwIBAgICEAAwDQYJKoZIhvcNAQELBQAwFjEUMBIGA1UEAwwLdHN0
LXJvb3QtY2EwHhcNMjIwODE0MDkzMDA3WhcNNDkxMjMwMDkzMDA3WjAVMRMwEQYD
VQQDDAp0c3Qtc2VydmVyMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA
p1/aEck7k7OGlQe373+zEYiznlk0ORrg0UeyDGsULaGyIpG+DW/1m6hga/y5LCOb
KNYhU2O2CYLOunzEXgFEhLq73zQ1rWNKdF/dE1P97lAeNmJ7qapVHgmvqRR+M5Jx
GHHAr3cRS06WW2H4jJD4HWVuYhuww6igP6WhVWYoPn6sgDcWE+HLI1DVwTxkA9J/
poPSSdT/VEgvH2aOwA0h1KVa9l6DrC3E/tPo8D8NPyeViSRb/HjyI3gXr74jQvq8
+4fTcftNAtyhUXUhXvlryBGKZmARB1gXAiNCuXYK08I8PmhRPwqVq15YYto9E4QY
kfCZoJaNrztbFCfDl8yiVQIDAQABo4HOMIHLMAwGA1UdEwEB/wQCMAAwDgYDVR0P
AQH/BAQDAgPoMBYGA1UdJQEB/wQMMAoGCCsGAQUFBwMBMB0GA1UdDgQWBBQ+lJCp
Lddxoxl5gRkI7stKqxYgBzBGBgNVHSMEPzA9gBRLDXoma3qhnuuYGSd3QtC70KFX
FqEapBgwFjEUMBIGA1UEAwwLdHN0LXJvb3QtY2GCCQDqQamzD/+BlTAsBgNVHREE
JTAjgglsb2NhbGhvc3SHBH8AAAGHBH8AAAKCCnRzdC1zZXJ2ZXIwDQYJKoZIhvcN
AQELBQADggEBAJPq3EqcPcvfv4qbuSJAIcCxdyAx2fyusUG/ylhSqr5VN9Tx9E57
LThHfGMqnzbQc5x+EDuNgSF+ENGZwEwVtHlmT5RBfxVyPhlSBFkUHafiBDZgeszu
gipGgn/MkLqw0qTrkwsM9quC0JA2PGwEdG1D6e2mO93pNLekZRGVusrvZ3oWiTlJ
qJxkRBS6Jo+mN+E39A02+DnMTqlJ9iEz4/WxEt5+ZusJfEG3CUzVagRlKRMH07sT
TlayKPK6xqesupJoBkBJ3UpDhfVrh4V6zz84eIVY54D9ctAM+JLyFh8zMu1Eyjzz
lL6itKCSei2lWVodvvO+BmkEqLqpGXrri5s=
-----END CERTIFICATE-----
`;

              cacert    = `
-----BEGIN CERTIFICATE-----
MIIDOzCCAiOgAwIBAgIJAOpBqbMP/4GVMA0GCSqGSIb3DQEBCwUAMBYxFDASBgNV
BAMMC3RzdC1yb290LWNhMB4XDTIyMDgxNDA5MjgwNFoXDTQ5MTIzMDA5MjgwNFow
FjEUMBIGA1UEAwwLdHN0LXJvb3QtY2EwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAw
ggEKAoIBAQCfdZdpipCK7gVxhhC4CvInK0n6Gf4MAJdkp3bqXXuMSIJsGrF9qbpY
FYAdpptr7X+EwkQ80nQcudXMsbou0Yg/iUG0FYp0iy8F4Fo6JTTLQAJ2l3OWrDsJ
Tp8w3HrKjPjzQUHc+NCv2RBIur+ViiF5Ur3qAvVygY3yyZWPzAHsZ+IckXtxvKZr
046zTekLJaXPA/iR5funJEJelDGOMbR4gGc3LOJp4BtRFuUX0dUdjPYzVvdhz4JA
H1+8bvY0qJCMlYFgRcPi6z47yU4ZgY0HTBtY0PqMX5HTskcvmavckPWFNigqS7zr
CikE8gbiC0E+u5mVk1j6k4hrvnEE1JGdAgMBAAGjgYswgYgwDwYDVR0TAQH/BAUw
AwEB/zAOBgNVHQ8BAf8EBAMCAYYwHQYDVR0OBBYEFEsNeiZreqGe65gZJ3dC0LvQ
oVcWMEYGA1UdIwQ/MD2AFEsNeiZreqGe65gZJ3dC0LvQoVcWoRqkGDAWMRQwEgYD
VQQDDAt0c3Qtcm9vdC1jYYIJAOpBqbMP/4GVMA0GCSqGSIb3DQEBCwUAA4IBAQCD
GB8xbbozjvEij6DESLKougYHjG33lT79tegixXnh+fFwr374VTx+nEcmz8ha0cFA
z0lig/8aOJm2vlB+iGY9/chztd91QL4/xiTIi4dYZFbQXXpsSwaIaEEDJ496p+Kx
nlh4AgczG7Yxs1MPm7QiYdLpRD128x8B4gkOwe54D9yUch/PHkb5jkII7a1ctb9q
ZzrfWtPiYt7x/DT1ljIYo2m4lLdns5CHkqHlDRjyaiV4kgi7EVlpIKvjZaNNpN1a
0aKw0m5zG50jX44AtKttW/EybFj0KR9hHeaGvB9MFIz2ZiPM9OGek6NPrLr7tSjJ
KcW4i/Y+AMJCHEjy+Mj/
-----END CERTIFICATE-----
`;

        }//setup
        
        
  //:
  //txt.hello:
  
txt.hello=`
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>http-file-upload</title>
<style>
      html,body {
            height            : calc(100%-60px);
      }
      body {
            font-family       : arial;
            font-size         : 18px;
            margin            : 30px;
      }
      .box {
            display           : flex;
            flex-flow         : column;
            height            : 100%;
      }
      .box>div:first-of-type {
            flex              : 0 1 auto;
      }
      .box>div:nth-of-type(2) {
            flex              : 1 1 auto;
      }
      
      h3 {
            margin-top        : 0;
      }
      h3>div:first-of-type {
            margin-bottom     : 10px;
      }
      h3>div:nth-of-type(2) {
            color             : blue;
      }
      .zone {
            position          : relative;
            margin            : 20px auto;
            padding           : 20px;
            border            : 1px dashed lightblue;
            border-radius     : 5px;
            height            : 150px;
      }
      .zone>* {
            margin            : 10px;
      }
      #output {
            line-height       : 24px;
            flex              : 1;
            border            : 1px solid lightgray;
            overflow          : auto;
            padding           : 20px;
      }
      input {
            font-size         : 18px;
            cursor            : pointer;
      }
</style>
<div class=box>
      <div>
            <h3>
                  <div>http-file-upload</div>
            </h3>
            <div class=zone ondrop='upload.drop()' ondragover='event.preventDefault()' ondragenter='event.preventDefault()' >
                  <span>drag files here</span>
                  <span>or</span>
                  <input value='select files' type=button onclick='upload.fileinput(event)' />
                  <span>or</span>
                  <input value='download' type=button onclick='download.read()' />
            </div>
            <input value=clear type=button onclick='log.clear()' />
            <br>
            <br>
      </div>
      <div id=output></div>
</div>

<script>

        console.clear();
        log('ready');
        log();
        var websocketurl   = 'ws'+(self.location.protocol==='https:'?'s':'')+'://'+self.location.host;
        log('websocket url :',websocketurl);
        log();
        
        
        var upload      = uploadmod();
        var download    = downloadmod();
        
  //:
  
  
  
function uploadmod(){

  var obj   = {};
  
  
        var chunksize   = 1024*1024;
        
        
        var create    = {};
        
        
  //:
  
        obj.files=function(files,callback){
        }//files
        
        obj.fileinput=function(event){
        
              var input         = document.createElement('input');
              input.type        = 'file';
              input.multiple    = true;
              input.onchange    = onchange;
              input.click();
              
              function onchange(){
              
                    var files   = input.files;
                    upload(files,complete);
                    
              }//onchange
              
              function complete(){
              
                    console.log('--- complete ---');
                    
              }//complete
              
        }//fileinput
        
        
  //:
  
        function upload(files,callback){
                                                                                console.log('upload',files.length,'files');
              var process   = create.process(files,callback);
              
              var n   = files.length;
              for(var i=0;i<n;i++){
              
                    create.progress(process,files,i);
                    
              }//for
              
              process.upload();
              
        }//upload
        
        create.process=function(files,callback){
        
              var rec       = {};
              var send      = {};
              var worker    = create.worker(rec);
              
              var file;
              var ct;
              var num;
              
              var process   = {files,callback,cur:0,send};
              
              var root                                = Tuploadprocess.content.firstElementChild.cloneNode(true);
              $(root,'#num').textContent              = files.length;
              $(root,'[value="abort all"]').onclick   = abortall;
              attachshadow(root);
              
              process.upload=function(){
              
                    file        = files[process.cur];
                    var size    = file.size;
                    num         = Math.ceil(size/chunksize);
                                                                                console.log(file.name,size,num);
                    worker.postMessage({type:'upload',name:file.name,num});
                    ct          = 0;
                    
              }//upload
              
              rec.open=function(){
                                                                                console.log('rec.open');
                    send.blob();
                    
              }//open
              
              rec.progress=function(){
              
                    if(file.status==='abort'){
                          next();
                          return;
                    }
                    
                    ct++;
                    var value   = Math.ceil(ct/num*100)+'%';
                    var root    = file.progress;
                    $(root,'#bar').style.width    = value;
                    $(root,'#value').textContent   = value;
                    
                    if(ct<num){
                          send.blob();
                          return;
                    }
                    
                    file.status                     = 'done';
                    $(root,'#value').textContent    = 'done';
                    next();
                    
              }//progress
              
              send.blob=function(){
              
                    var start   = ct*chunksize;
                    var end     = start+chunksize;
                    var blob    = file.slice(start,end);
                    worker.postMessage(blob);
                    
              }//blob
              
              send.abort=function(){
              
                    worker.postMessage({type:'abort'});
                    
              }//abort
              
              rec.error=function(json){
              
                    var root                        = file.progress;
                    $(root,'#value').textContent    = 'error';
                    log('error');
                    log(json.msg);
                    log.spc();
                    next();
                    
              }//error
              
              function next(){
              
                    var cur   = process.cur+1;
                    for(cur;cur<files.length;cur++){
                    
                          if(files[cur].status==='pending'){
                                process.cur   = cur;
                                process.upload();
                                return;
                          }
                          
                    }//for
                    
                    complete();
                    
              }//next
              
              function abortall(){
              
                    if(process.cur===null){
                          return;
                    }
                    
                    send.abort();
                    
                    var i   = process.cur;
                    for(i;i<files.length;i++){
                    
                          var file    = files[i];
                          var root    = file.progress;
                          $(root,'#value').textContent    = 'abort';
                          file.status   = 'abort';
                          
                    }//for
                    
              }//abortall
              
              function complete(){
              
                    process.cur   = null;
                    worker.terminate();
                    
                    if(typeof callback==='function'){
                          callback();
                          return;
                    }
                    
              }//complete
              
              return process;
              
        }//process
        
        create.worker=function(rec){
        
              var worker                        = new Worker('worker.js');
              worker.onmessage                  = onmsg;
              worker.onerror                    = werror;
              worker.postMessage({type:'init',url:websocketurl});
              return worker;
              
              function onmsg(event){
              
                    var data    = event.data;
                    var type    = datatype(data);
                    switch(type){
                    
                      case 'string'   : var json    = JSON.parse(data);
                                        rec[json.type](json);
                                        break;
                                        
                    }//switch
                    
              }//onmsg
              
        }//worker
        
        create.progress=function(process,files,i){
        
              var file                          = files[i];
              var root                          = Tuploadprogress.content.firstElementChild.cloneNode(true);
              $(root,'#name').textContent       = file.name;
              $(root,'#size').textContent       = hs(file.size);
              $(root,'[value=abort]').onclick   = click;
              attachshadow(root);
              file.progress   = root;
              file.status     = 'pending';
              
              function click(){
              
                    if(file.status!=='pending'){
                          return;
                    }
                    $(root,'#value').textContent    = 'abort';
                    file.status                     = 'abort';
                    if(process.cur===i){
                          process.send.abort();
                    }
                    
              }//click
              
        }//progress
        
  //:
  
  
  return obj;
  
//uploadmod:-
}

  //:
  
function downloadmod(){

  var obj   = {};
  
        var create    = {};
        
  //:
  
        obj.files=function(files,callback){
        
              download(files,callback);
              
        }//files
        
        obj.list=function(){
        
              var files   = ['testX.tmp','test2.tmp'];
              download(files,complete);
              
        }//list
        
        obj.prompt=function(){
        
              var filename    = getfilename();
              var files       = [filename];
              download(files,complete);
              
        }//prompt
        
        obj.read=function(){
        
              var hldr                            = document.createElement('div');
              var root                            = Tdownloadlist.content.firstElementChild.cloneNode(true);
              $(root,'[value=ok]').onclick        = ok;
              $(root,'[value=cancel]').onclick    = cancel;
              var list    = $(root,'#list');
              var item    = $(root,'.item');
              item.remove();
              hldr.attachShadow({mode:'open'}).append(root);
              document.body.append(hldr);
              
              var worker                        = new Worker('worker.js');
              worker.onmessage                  = onmsg;
              worker.onerror                    = werror;
              worker.postMessage({type:'init',url:websocketurl});
              worker.postMessage({type:'download-list'});
              return worker;
              
              function onmsg(event){
                                                                                //console.log('onmsg',event.data);
                    var json    = JSON.parse(event.data);
                    
                    if(json.type==='error'){
                          hldr.remove();
                          log('directory read error');
                          log(json.msg);
                          log.spc();
                          return;
                    }
                    
                    var files   = json.files;
                    files.forEach(name=>{
                    
                          var nitem   = item.cloneNode(true);
                          var input   = $(nitem,'input');
                          nitem.onclick   = e=>{if(e.target!==input)input.checked    = !input.checked;};
                          $(nitem,'.name').textContent   = name;
                          list.append(nitem);
                          
                    });
                    
              }//onmsg
              
              function cancel(){
              
                    hldr.remove();
                    
              }//cancel
              
              function ok(){
              
                    var files   = [];
                    var items   = list.querySelectorAll('.item');
                    items.forEach(item=>{
                    
                          var input   = $(item,'input');
                          if(input.checked){
                                var name    = $(item,'.name').textContent;
                                files.push(name);
                          }
                          
                    });
                    hldr.remove();
                    
                    download(files,complete);
                    
              }//ok
              
        }//list
        
        
        function complete(){
        
              console.log('--- complete ---');
              
        }//complete
        
        
        
        
  //:
  
        function download(files,callback){
        
              var process   = create.process(callback,files);
              
              var n           = files.length;
              for(var i=0;i<n;i++){
              
                    create.progress(process,files,i);
                    
              }//for
              
              process.download();
              
        }//download
        
        create.process=function(callback,files){
        
              var root                      = Tdownloadprocess.content.firstElementChild.cloneNode(true);
              var n                         = files.length;
              $(root,'#num').textContent    = n;
              $(root,'[value="abort all"]').onclick   = abortall;
              attachshadow(root);
              
              var cur                       = 0;
              var ct                        = 0;
              var num;
              var rec                       = {};
              var send                      = {};
              var worker                    = create.worker(rec);
              
              send.download     = function(file){
              
                    process.list[cur].status    = 'downloading';
                    var file    = files[cur];
                    worker.postMessage({type:'download',file});
                    
              };
              send.progress     = function(){worker.postMessage({type:'progress'})}
              send.abort        = function(){worker.postMessage({type:'abort'})}
              
              var process   = {
                    download    : send.download,
                    abort       : send.abort,
                    list        : [],
                    cur         : 0,
              };
              
              
              rec.start=function(json){
              
                    num         = json.num;
                    var size    = json.size;
                    var root    = process.list[cur].root;
                    $(root,'#size').textContent   = hs(size);
                                                                                //console.log('start',num,size);
              }//start
              
              rec.blob=function(blob){
                                                                                //console.log('rec.blob');
                    if(process.list[cur].status==='abort'){
                          next();
                          return;
                    }
                    
                    ct++;
                    process.list[cur].blob.push(blob);
                    
                    var root    = process.list[cur].root;
                    var value   = Math.ceil(ct/num*100)+'%';
                    $(root,'#bar').style.width    = value;
                    $(root,'#value').textContent   = value;
                    
                    if(ct<num){
                          send.progress();
                    }else{
                          process.list[cur].status    = 'done';
                          process.list[cur].blob      = new Blob(process.list[cur].blob);
                          
                          var root    = process.list[cur].root;
                          $(root,'#value').textContent   = 'done';
                          $(root,'input').value   = 'download';
                          next();
                    }
                    
              }//blob
              
              rec.error=function(json){
              
                    var msg         = json.msg;
                    var filename    = files[cur];
                    var root        = process.list[cur].root;
                    $(root,'#value').textContent   = 'error';
                    log('error',filename);
                    log(msg);
                    log.spc();
                    next();
                    
              }//error
              
              function next(){
              
                    for(cur++;cur<files.length;cur++){
                    
                          if(process.list[cur].status==='pending'){
                                process.cur   = cur;
                                ct            = 0;
                                process.download();
                                return;
                          }
                          
                    }//for
                    
                    complete();
                    
              }//next
              
              function abortall(){
              
                    if(cur===null){
                          return;
                    }
                    
                    send.abort();
                    
                    for(var i=cur;i<files.length;i++){
                    
                          var o   = process.list[i];
                          o.status                          = 'abort';
                          $(o.root,'#value').textContent    = 'aborted';
                          
                    }//for
                    
              }//abortall
              
              function complete(){
              
                    cur   = null;
                    worker.terminate();
                    
                    if(typeof callback==='function'){
                          callback();
                    }
                    
              }//complete
              
              return process;
              
        }//process
        
        
        create.worker=function(rec){
        
              var worker                        = new Worker('worker.js');
              worker.onmessage                  = onmsg;
              worker.onerror                    = werror;
              worker.postMessage({type:'init',url:websocketurl});
              return worker;
              
              function onmsg(event){
                                                                                //console.log('onmsg',event.data);
                    var data    = event.data;
                    var type    = datatype(data);
                    switch(type){
                    
                      case 'string'   : var json    = JSON.parse(data);
                                        rec[json.type](json);
                                        break;
                                        
                      case 'blob'     : rec.blob(data);     break;
                      
                    }//switch
                    
              }//onmsg
              
        }//worker
        
        
        create.progress=function(process,files,index){
        
              var filename                  = files[index];
              
              var root                      = Tdownloadprogress.content.firstElementChild.cloneNode(true);
              var btn                       = $(root,'input');
              btn.onclick                   = click;
              $(root,'#name').textContent   = filename;
              attachshadow(root);
              
              var o   = {
                    root,
                    status    : 'pending',
                    blob      : []
              };
              
              process.list.push(o);
              
              function click(){
              
                    if(o.status==='done'){
                          var url       = window.URL.createObjectURL(o.blob);
                          var a         = document.createElement('a');
                          a.href        = url;
                          a.download    = filename;
                          a.click();
                          return;
                    }
                    
                    if(index===process.cur){
                          process.abort();
                    }
                    
                    o.status                        = 'abort';
                    $(root,'#value').textContent    = 'aborted';
                    
              }//click
              
        }//progress
        
  //:
  
  return obj;
  
//downloadmod:-
}


  //:
  
        function attachshadow(root){
        
                var div   = document.createElement('div');
                div.attachShadow({mode:'open'}).append(root);
                output.append(div);
                
        }//attachshadow
        
        function log(){
        
              var str   = Array.prototype.join.call(arguments,' ');
              var div   = document.createElement('div');
              div.textContent   = str;
              div.innerHTML+='&nbsp;';
              output.append(div);
              output.scrollTop    = output.scrollHeight;
              
        }//log
        
        log.spc=function(){
        
              var div   = document.createElement('div');
              div.style.height   = '10px';
              output.append(div);
              output.scrollTop    = output.scrollHeight;
              
        }//spc
        
        log.clear=function(){
        
              output.innerHTML    = '';
              
        }//clear
        
        function $(root,selector){
        
              var node    = root.querySelector(selector);
              return node;
              
        }//$
        
        function hs(bytes){
        
              var thresh    = 1000;
              var unit      = ['B','KB','MB','GB','TB','PB','EB','ZB','YB'];
              for(var i=0;i<unit.length;i++){
              
                    if(bytes<thresh){
                          var b   = bytes.toFixed(2);
                          return b+' '+unit[i];
                    }
                    bytes  /= thresh;
                    
              }//for
              
        }//hs
        
        function werror(e){
        
              log('ERROR: Line ', e.lineno, ' in ', e.filename, ': ', e.message);
              
        }//werror
        
        function getfilename(){
        
              var filename    = window.prompt('enter filename to download');
              if(!filename){
                    log('download cancelled');
                    return;
              }
              return filename;
              
        }//getfilename
        
        function datatype(value){
        
              var str     = Object.prototype.toString.call(value);
              var i       = str.indexOf(' ');
              var type    = str.slice(i+1,-1);
              type        = type.toLowerCase();
              return type;
              
        }//datatype
        
        
</script>

<!--
  //:
  //template-upload:
-->

<template id=Tuploadprocess>
      <div>
            <style>
                  #root {
                        margin              : 10px auto;
                        padding             : 10px 20px;
                        background-color    : rgba(222,250,222,1);
                        border-top          : 2px solid green;
                  }
                  #hdr {
                        margin-right        : 20px;
                  }
                  input {
                        font-size           : 18px;
                        cursor              : pointer;
                  }
            </style>
            <div id=root>
                  <span id=hdr>
                        uploading <span id=num>n</span> files
                  </span>
                  <input value='abort all' type=button />
            </div>
      </div>
</template>

<template id=Tuploadprogress>
      <div>
            <style>
                  #name {
                        color               : green;
                        font-weight         : bold;
                        margin              : auto 25px;
                  }
                  #size {
                        color               : green;
                        font-weight         : bold;
                        margin              : auto 25px auto 10px;
                  }
                  #root {
                        display             : flex;
                        margin              : 10px auto;
                  }
                  #progress {
                        flex                : 1;
                        position            : relative;
                        left                : 0;
                        right               : 0;
                        border              : 1px solid lightgray;
                        text-align          : center;
                        margin              : 5px 10px;
                  }
                  #bar {
                        position            : absolute;
                        left                : 0;
                        top                 : 0;
                        width               : 0%;
                        height              : 100%;
                        background-color    : lightblue;
                        z-index             : -1;
                  }
                  #value {
                  }
                  input {
                        font-size           : 18px;
                        margin              : auto 10px;
                        cursor              : pointer;
                  }
            </style>
            <div>
                  <div>
                        <span id=name>name</span><span id=size>0.00 MB</span>
                  </div>
                  <div id=root>
                        <input value=abort type=button />
                        <div id=progress>
                              <div id=bar>
                              </div>
                              <span id=value>0%</span>
                        </div>
                  </div>
            </div>
      </div>
</template>

<!--
  //:
  //template-download:-
-->

<template id=Tdownloadprocess>
      <div>
            <style>
                  #root {
                        margin              : 10px auto;
                        padding             : 10px 20px;
                        background-color    : rgba(222,250,222,1);
                        border-top          : 2px solid green;
                  }
                  #hdr {
                        margin-right        : 20px;
                  }
                  input {
                        font-size           : 18px;
                        cursor              : pointer;
                  }
            </style>
            <div id=root>
                  <span id=hdr>
                        downloading <span id=num>n</span> files
                  </span>
                  <input value='abort all' type=button />
            </div>
      </div>
</template>

<template id=Tdownloadprogress>
      <div>
            <style>
                  #name {
                        color               : green;
                        font-weight         : bold;
                        margin              : auto 25px auto 10px;
                  }
                  #size {
                        color               : green;
                        font-weight         : bold;
                        margin              : auto 25px auto 10px;
                  }
                  #root {
                        display             : flex;
                        margin              : 10px auto;
                  }
                  #progress {
                        flex                : 1;
                        position            : relative;
                        left                : 0;
                        right               : 0;
                        border              : 1px solid lightgray;
                        text-align          : center;
                        margin              : 5px 10px;
                  }
                  #bar {
                        position            : absolute;
                        left                : 0;
                        top                 : 0;
                        width               : 0%;
                        height              : 100%;
                        background-color    : lightblue;
                        z-index             : -1;
                  }
                  #value {
                  }
                  input {
                        font-size           : 18px;
                        margin              : auto 10px;
                        cursor              : pointer;
                  }
            </style>
            <div>
                  <div>
                        <span id=hdr>
                              <span id=name>name</span><span id=size>---</span>
                        </span>
                  </div>
                  <div id=root>
                        <input value=abort type=button />
                        <div id=progress>
                              <div id=bar>
                              </div>
                              <span id=value>0%</span>
                        </div>
                  </div>
            </div>
      </div>
</template>

<template id=Tdownloadlist>
      <div>
            <style>
                  #root {
                        position    : fixed;
                        left        : 0;
                        top         : 0;
                        width       : 100%;
                        height      : 100%;
                        box-sizing    : border-box;
                        background-color    : white;
                        border        : 1px solid blue;
                        padding       : 10px;
                  }
                  [value=cancel] {
                        margin    : auto 20px auto auto;
                  }
                  [value=ok] {
                        margin    : auto 20px;
                        padding-left   : 20px;
                        padding-right   : 20px;
                  }
                  #list {
                        margin-top      : 10px;
                        overflow      : auto;
                  }
                  .item {
                        margin    : 5px auto;
                        cursor    : pointer;
                  }
                  .item:hover {
                        background-color    : lightyellow;
                  }
                  .item input {
                        width     : 18px;
                        height    : 18px;
                        vertical-align    : middle;
                  }
                  .name {
                        vertical-align    : middle;
                  }
                  input {
                        font-size   : 18px;
                        cursor      : pointer;
                  }
            </style>
            <div id=root>
                  <input value=cancel type=button />
                  select files to download
                  <input value=ok type=button />
                  <div id=list>
                        <div class=item>
                              <input type=checkbox />
                              <span class=name>name</name>
                        </div>
                  </div>
            </div>
      </div>
</template>
`;

  //txt.worker:
  
txt.worker=`



        var socket;
        var onopen;
        
        self.onmessage=function(event){
        
              var json    = event.data;
              switch(json.type){
              
                case 'init'               : init(json);                 break;
                case 'upload'             : upload(json);               break;
                case 'download'           : download(json);             break;
                case 'download-list'      : download.list(json);        break;
                
              }//switch
              
        }//onmessage
        
        function init(json){
        
              var url             = json.url;
              socket              = new WebSocket(url);
              socket.onerror      = console.error;
              socket.onmessage    = event=>self.postMessage(event.data);
              socket.onopen       = ()=>{
              
                    if(onopen){
                          onopen();
                    }else{
                          onopen    = true;
                    }
                    
              };
              
        }//init
        
        function onready(json){
        
              var fn    = ()=>socket.send(JSON.stringify(json));
              if(onopen){
                    fn();
              }else{
                    onopen    = fn;
              }
              
        }//onready
        
  //:
  
        function upload(json){
        
              onready(json);
              self.onmessage    = event=>{
              
                    var data    = event.data;
                    var type    = datatype(data);
                    switch(type){
                    
                      case 'object'   : socket.send(JSON.stringify(event.data));      break;
                      case 'blob'     : socket.send(data);                            break;
                      
                    }//switch
                    
              };
              
        }//upload
        
  //:
  
        function download(json){
        
              onready(json);
              self.onmessage    = event=>socket.send(JSON.stringify(event.data));
              
        }//download
        
        download.list=function(json){
        
              onready(json);
              
        }//list
        
  //:
  
        function datatype(value){
        
              var str     = Object.prototype.toString.call(value);
              var i       = str.indexOf(' ');
              var type    = str.slice(i+1,-1);
              type        = type.toLowerCase();
              return type;
              
        }//datatype
        
        
        
`;








/*

wsmod:d

03-09-22
31-10-22    - multiple connections


*/



      module.exports    = wsmod;
      
      
function wsmod(){

  var obj               = {};
  
  
        var crypto      = require("crypto");
        
        const two16     = Math.pow(2,16);
        const two64     = Math.pow(2,64);
        
        
        var op          = {};
        var frame       = {};
        obj.frame       = frame;
        var rd          = {};
        var wt          = {};
        var pos         = {};
        var mask        = {};
        var extlen      = {};
        var bit         = {};
        var display     = {};
        
        
//connection:

        var list    = [];
        obj.list    = list;
        
        list.remove=function(con){
        
              var n   = list.length;
              
              for(var i=0;i<n;i++){
              
                    if(list[i]===con){
                          list.splice(i,1);
                          return;
                    }
                    
              }//for
              
        }//remove
        
        list.closeall=function(){
        
              var n   = list.length;
              
              for(var i=n-1;i>=0;i--){
              
                    var con   = list[i];
                    close(con);
                    
              }//for
              
        }//closeall
        
        
        
        
        function connection(socket,onrec,onerror,onclose){   //c
        
          var con   = {};
          
                list.push(con);
                
                
                con.onrec       = onrec;
                con.onerror     = onerror;
                con.onclose     = onclose;
                
                con.websocket   = socket;
                con.buffer      = Buffer.alloc(0);
                
                con.send        = {};
                
                var payload     = {
                
                      buffer      : null,
                      type        : null,
                      
                      add         : function(frame){
                      
                            var fragment      = rd.payload(frame);
                            payload.buffer    = Buffer.concat([payload.buffer,fragment]);
                            
                            var fin           = rd.fin(frame);
                            if(fin){
                                  rec(payload.buffer,payload.type,con);
                                  payload.reset();
                            }
                            
                      },
                      
                      reset       : function(){
                      
                            payload.buffer   = Buffer.alloc(0);
                            payload.type     = null;
                            
                      }
                      
                };
                
                con.payload   = payload;
                
                payload.reset();
                
                
  //:
  
  
                function rec(payload,type,con){
                
                      call('rec',payload,type,con);
                      
                }//rec
                
                
  //:
  
  
                con.send.frame=function(buffer){
                
                      var r   = send(con,buffer);
                      return r;
                      
                }//send
                
                con.send.text=function(str){
                
                      var r   = send.text(con,str);
                      return r;
                      
                }//send.text
                
                con.send.binary=function(buffer){
                
                      var r   = send.binary(con,buffer);
                      return r;
                      
                }//binary
                
                con.send.ping=function(){
                
                      var r   = send.ping(con);
                      return r;
                      
                }//send.ping
                
                con.send.json=function(json){
                
                      var txt   = JSON.stringify(json);
                      var r     = send.text(con,txt);
                      return r;
                      
                }//send.json
                
                
  //:
  
  
                con.close=function(){
                
                      close(con);
                      
                }//close
                
                
  //:
  
  
                socket.on('error',err=>{
                
                      call('error',err,con);
                      
                });
                
                socket.on('close',()=>{
                
                      call('close',con);
                      
                });
                
                
  //:
  
                var fn          = {};
                fn.rec          = [];
                fn.error        = [];
                fn.close        = [];
                
                con.on=function(name,userfn){
                
                      if(typeof userfn!=='function'){
                            return;
                      }
                      var list    = fn[name];
                      if(!list){
                            return;
                      }
                      list.push(userfn);
                      
                }//on
                
                con.remove=function(name,userfn){
                
                      var list    = fn[name];
                      if(!list){
                            return;
                      }
                      var n       = list.length;
                      for(var i=0;i<n;i++){
                      
                            var userfn2   = list[i];
                            if(userfn2===userfn){
                                  list.splice(i,1);
                                  return;
                            }
                            
                      }//for
                      
                }//remove
                
                
                function call(name){
                
                      var args    = Array.prototype.slice.call(arguments,1);
                      
                      var mainfn    = con['on'+name];
                      callfn(mainfn);
                      
                      fn[name].forEach(userfn=>userfn.apply(null,args));
                      
                      function callfn(fn){
                      
                            if(typeof fn!=='function'){
                                  return;
                            }
                            fn.apply(null,args);
                            
                      }//callfn
                      
                }//call
                
                
            return con;
            
          }//connection
          
          
  //:
  
  
  
        obj.upgrade=function(socket,onrec,onerror,onclose){return upgrade(socket,onrec,onerror,onclose)}    //d
        
        function upgrade(socket,onrec,onerror,onclose){
        
              var con   = connection(socket,onrec,onerror,onclose);
              
              socket.on('data',data=>rec(con,data));
              
              socket.on('error',err=>{
              
                    console.log('error');
                    console.error(err);
                    
              });
              
              socket.on('close',()=>{
              
                    list.remove(con);
                    console.log('closed');
                    
              });
              
              return con;
              
        }//upgrade
        
        
        obj.upgrade.server=function(req,socket,onrec,onerror,onclose){return upgrade.server(req,socket,onrec,onerror,onclose)}    //d
        
        upgrade.server=function(req,socket,onrec,onerror,onclose){
                                                                              console.log('upgrade');
              if(req.headers['upgrade']!=='websocket'){
                                                                              console.log(req.url,'bad request',req.headers['upgrade']);
                    socket.end('HTTP/1.1 400 Bad Request');
                    return;
              }
              
              handshake(req,socket);
              
              var con   = upgrade(socket,onrec,onerror,onclose);
              return con;
              
        }//upgrade.server
        
        
  //:
  
  
  
  
        function handshake(req,socket){
        
              var headers   = [
                    'HTTP/1.1 101 Web Socket Protocol Handshake',
                    'Upgrade: WebSocket',
                    'Connection: Upgrade'
              ];
              
              var key   = req.headers['sec-websocket-key'];
              if(key){
                    var hash    = genhash(key)
                    headers.push('Sec-WebSocket-Accept: '+hash);
              }
              
              headers   = headers.join('\r\n');
              headers  += '\r\n\r\n';
              
              socket.write(headers);
              
              
              function genhash(key){
              
                    var fn      = crypto.createHash("sha1");
                    var data    = fn.update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11','binary');
                    var b64     = data.digest('base64');
                    return b64;
                    
              }//genhash
              
        }//handshake
        
        
        function rec(con,buf){
        
              con.buffer    = Buffer.concat([con.buffer,buf]);
              
              while(frame.available(con.buffer)){
              
                    var buf       = frame.rd(con.buffer);
                    con.buffer    = frame.remove(con.buffer);
                    
                    var opcode    = rd.opcode(buf);
                    
                    switch(opcode){
                    
                      case 0    : op.continuation(con,buf);       break;      //continuation
                      case 1    : op.text(con,buf);               break;      //text
                      case 2    : op.binary(con,buf);             break;      //binary
                      
                      case 8    : op.close(con);                  break;      //close
                      case 9    : op.ping(con);                   break;      //ping
                      case 10   : op.pong(con);                   break;      //pong
                      
                    }//switch
                    
              }//while
              
        }//rec
        
        
        function close(con){
        
              send.close(con);
              con.websocket.destroy();
              list.remove(con);
              
        }//close
        
        
  //:-
  
  
        op.continuation=function(con,frame){
        
              if(con.payload.type===null){
                    close(con);
                    return;
              }
              
              con.payload.add(frame);
              
        }//continuation
        
        op.text=function(con,frame){
        
              if(con.payload.type!==null){
                    close(con);
                    return;
              }
              
              con.payload.type    = 'text';
              con.payload.add(frame);
              
        }//text
        
        op.binary=function(con,frame){
        
              if(con.payload.type!==null){
                    close(con);
                    return;
              }
              
              con.payload.type    = 'binary';
              con.payload.add(frame);
              
        }//binary
        
        op.close=function(con,frame){
        
              close(con);
              
        }//close
        
        op.ping=function(con){
                                                        console.log('ping received');
              var buf   = frame.create.pong();
              send(con,buf);
              
        }//ping
        
        op.pong=function(){
                                                        console.log('pong received');
        }//pong
        
        
  //:
  
  
        function send(con,buffer){
        
              con.websocket.write(buffer);
              
        }//send
        
        send.text=function(con,txt){
                                                                      //console.log('send : '+txt);
              var payload   = Buffer.from(txt,'utf8');
              var buffer    = frame.create(1,1,false,payload);
                                                                      //display.buffer(buffer);
              send(con,buffer);
              
        }//text
        
        send.binary=function(con,payload){
        
              var buffer    = frame.create(1,2,false,payload);
              send(con,buffer);
              
        }//binary
        
        send.ping=function(con){
        
              var buf   = frame.create.ping();
              send(con,buf);
              
        }//ping
        
        send.close=function(con){
        
              var buf   = frame.create.close();
              send(con,buf);
              
        }//close
        
        
  //:
  
  
        frame.rd=function(buffer){
        
              var len     = pos.endframe(buffer);
              var frame   = Buffer.alloc(len);
              buffer.copy(frame,0,0,len);
              return frame;
              
        }//rd
        
        frame.create=function(fin,opcode,ismasked,payload){
        
              payload       = payload||Buffer.alloc(0);
              
              var size      = frame.size(payload,ismasked);
              var buffer    = Buffer.alloc(size);
              
              wt.fin(buffer,fin);
              wt.opcode(buffer,opcode);
              wt.ismasked(buffer,ismasked);
              
              if(ismasked){
                    var buf    = mask.create();
                    wt.mask(buffer,buf);
                    mask.mask(payload,buf);
              }
              
              wt.paylen(buffer,payload.length);
              wt.payload(buffer,payload);
              
              return buffer;
              
        }//create
        
        frame.remove=function(buffer){
                                                                    //console.log('removeframe');
              var len   = pos.endframe(buffer);
              var num   = buffer.length-len;
              var buf   = Buffer.alloc(num);
              
              buffer.copy(buf,0,len);
              return buf;
              
        }//remove
        
        frame.size=function(payload,ismasked){
        
              var len     = payload.length;
              var ext     = extlen.len(len);
              var mask    = ismasked?4:0;
              
              var size    = 2+ext+mask+len;
              return size;
              
        }//size
        
        frame.available=function(buffer){
        
              if(buffer.length<2){
                    return false;
              }
              
              var ismasked        = rd.ismasked(buffer);
              var payloadlength   = rd.payloadlength(buffer);
              
              var hdr             = 2;
              var ext             = extlen.paylen(payloadlength);
              var hdrlen          = hdr+ext;
              
              if(buffer.length<hdrlen){
                    return false;
              }
              
              var mask            = ismasked?4:0;
              var paylen          = rd.paylen(buffer);
              var framelength     = hdrlen+mask+paylen;
              
              if(buffer.length<framelength){
                    return false;
              }
              
              return true;
              
        }//available
        
        
  //:-
  
  
        frame.create.binary=function(buf){
        
              var buffer    = frame.create(1,2,0,buf);
              return buffer;
              
        }//binary
        
        frame.create.text=function(str){
        
              var payload   = Buffer.from(str,'utf8');
              var buffer    = frame.create(1,1,0,payload);
              return buffer;
              
        }//text
        
        frame.create.close=function(){
        
              var buffer   = frame.create(1,8);
              return buffer;
              
        }//close
        
        frame.create.ping=function(){
        
              var buffer   = frame.create(1,9);
              return buffer;
              
        }//ping
        
        frame.create.pong=function(){
        
              var buffer    = frame.create(1,10);
              return buffer;
              
        }//pong
        
        
  //:
  
  
        rd.fin=function(buffer){
        
              var byte    = buffer.readUInt8(0);
              var fin     = bit.rd(byte,7);
              return fin;
              
        }//fin
        
        rd.opcode=function(buffer){
        
              var byte      = buffer.readUInt8(0);
              var opcode    = byte & 15;
              return opcode;
              
        }//opcode
        
        rd.ismasked=function(buffer){
        
              var byte        = buffer.readUInt8(1);
              var ismasked    = bit.rd(byte,7);
              return ismasked;
              
        }//ismasked
        
        rd.payloadlength=function(buffer){
        
              var byte      = buffer.readUInt8(1);
              var paylen    = byte & 127;
              return paylen;
              
        }//payloadlength
        
        
        rd.extpaylen=function(buffer){
        
              var paylen    = rd.payloadlength(buffer);
              var len;
              
              if(paylen<126){
                    return null;
              }
              
              if(paylen===126){
                    len   = buffer.readUInt16BE(2)
                    return len;
              }
              
              len   = buffer.readBigUInt64BE(2);
              len   = Number(len);
              return len;
              
        }//extpaylen
        
        rd.paylen=function(buffer){
        
              var len     = rd.payloadlength(buffer);
              
              if(len<126){
                    return len;
              }
              
              len    = rd.extpaylen(buffer);
              return len;
              
        }//paylen
        
        rd.mask=function(buffer){
        
             var index    = pos.mask(buffer);
             var mask     = Buffer.alloc(4);
             buffer.copy(mask,0,index,index+4);
             return mask;
             
        }//mask
        
        rd.payload=function(buffer){
        
              var index     = pos.payload(buffer);
              var len       = rd.paylen(buffer);
              
              var payload   = Buffer.alloc(len);
              buffer.copy(payload,0,index,index+len);
              
              var ismasked    = rd.ismasked(buffer);
              if(ismasked){
                    var buf    = rd.mask(buffer);
                    mask.mask(payload,buf);
              }
              
              return payload;
              
        }//payload
        
        
  //:
  
  
        wt.fin=function(buffer,fin){
        
              var byte    = buffer.readUInt8(0);
              byte        = bit.wt(byte,7,fin);
              buffer.writeUInt8(byte,0);
              
        }//fin
        
        wt.opcode=function(buffer,opcode){
        
              var byte    = buffer.readUint8(0);
              
              for(var i=0;i<4;i++){
              
                    var v   = bit.rd(opcode,i);
                    byte    = bit.wt(byte,i,v);
                    
              }//for
              
              buffer.writeUInt8(byte,0);
              
        }//opcode
        
        wt.ismasked=function(buffer,ismasked){
        
              var byte    = buffer.readUInt8(1);
              byte        = bit.wt(byte,7,ismasked);
              buffer.writeUInt8(byte,1);
              
        }//ismasked
        
        wt.payloadlength=function(buffer,len){
        
              var byte    = buffer.readUInt8(1);
              
              if(len<126){
                    write(len);
                    return;
              }
              
              if(len<two16){
                    write(126);
                    return;
              }
              
              write(127);
              
              
              function write(num){
              
                    for(var i=0;i<7;i++){
                    
                          var v   = bit.rd(num,i);
                          byte    = bit.wt(byte,i,v);
                          
                    }//for
                    
                    buffer.writeUInt8(byte,1);
                    
              }//write
              
        }//payloadlength
        
        wt.extpaylen=function(buffer,len){
        
              if(len<126){
                    return;
              }
              
              if(len<two16){
                    buffer.writeUInt16BE(len,2);
                    return;
              }
              
              var lenn    = BigInt(len);
              buffer.writeBigUInt64BE(lenn,2);
              
        }//extpaylen
        
        wt.paylen=function(buffer,len){
        
              wt.payloadlength(buffer,len);
              wt.extpaylen(buffer,len);
              
        }//paylen
        
        wt.mask=function(buffer,mask){
        
              var index   = pos.mask(buffer);
              mask.copy(buffer,index);
              
        }//mask
        
        wt.payload=function(buffer,payload){
        
              var index   = pos.payload(buffer);
              payload.copy(buffer,index);
              
        }//payload
        
        
  //:
  
  
        pos.mask=function(buffer){
        
              var hdr       = 2;
              var paylen    = rd.payloadlength(buffer);
              var ext       = extlen.paylen(paylen);
              
              var index     = hdr+ext;
              return index;
              
        }//mask
        
        
        pos.payload=function(buffer){
        
              var mindex      = pos.mask(buffer);
              var ismasked    = rd.ismasked(buffer);
              var mask        = ismasked?4:0;
              
              var pindex      = mindex+mask;
              return pindex;
              
        }//payload
        
        
        pos.endframe=function(buffer){
        
              var pindex      = pos.payload(buffer);
              var plen        = rd.paylen(buffer);
              var framelen    = pindex+plen;
              return framelen;
              
        }//frame
        
        
  //:
  
  
        mask.create=function(){
        
              var mask    = Buffer.alloc(4);
              
              for(var i=0;i<4;i++){
              
                    var v   = Math.floor(Math.random()*256);
                    mask.writeUInt8(v,i);
                    
              }//for
              
              return mask;
              
        }//create
        
        mask.mask=function(payload,mask){
        
              var n   = payload.length;
              
              for(let i=0;i<n;i++){
              
                    var byte    = payload.readUInt8(i);
                    byte        = byte ^ mask[i&3];
                    payload.writeUInt8(byte,i);
                    
              }//for
              
        }//mask
        
        
  //:
  
  
        extlen.len=function(len){
        
              if(len<126){
                    return 0;
              }
              
              if(len<two16){
                    return 2;
              }
              
              return 8;
              
        }//size
        
        extlen.paylen=function(payloadlength){
        
              if(payloadlength<126){
                    return 0;
              }
              
              if(payloadlength===126){
                    return 2;
              }
              
              return 8;
              
        }//payloadlength
        
        
  //:
  
  
        bit.set       = function(num,n){return num | (1<<n)}
        bit.clear     = function(num,n){return num & ~(1<<n)}
        bit.wt        = function(num,n,v){return v ? bit.set(num,n) : bit.clear(num,n)}
        bit.rd        = function(num,n){return (num>>n) & 1}
        
        
  //:
  
  
        display.buffer=function(buffer,str){
        
              str   = str||'buffer';
              
              console.log();
              console.log(str+' : '+buffer.length);
              console.log();
              
              for(var i=0;i<buffer.length;i++){
              
                    var s       = (i+'').padStart(3);
                    
                    var byte    = buffer.readUInt8(i);
                    var str     = byte.toString(2);
                    str         = str.padStart(8,'0');
                    
                    console.log(s,' - ',str);
                    
              }//for
              
              console.log();
              
        }//buffer
        
        
        
        
        
        
  return obj;
  
//wsmod:d-
}









