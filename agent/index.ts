
/*************************************************************************************
 * Name: frida-ios-cipher
 * OS: iOS
 * Author: @humenger
 * Source: https://github.com/humenger/frida-ios-cipher
 * Desc: Intercept all cryptography-related functions on iOS with Frida Api.
 * refs:https://opensource.apple.com/source/CommonCrypto/CommonCrypto-36064/CommonCrypto/CommonCryptor.h
 * refs:https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man3/CC_MD5.3cc.html#//apple_ref/doc/man/3cc/CC_MD5
 * refs:https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man3/CC_SHA.3cc.html#//apple_ref/doc/man/3cc/CC_SHA
 * refs:https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man3/CCCryptor.3cc.html#//apple_ref/doc/man/3cc/CCCryptor
 * refs:https://www.cnblogs.com/cocoajin/p/6150203.html
 * refs:https://frida.re/docs/javascript-api/
 * refs:https://codeshare.frida.re/@xperylab/cccrypt-dump/
 * refs:https://github.com/federicodotta/Brida
 **************************************************************************************/
//config
const CIPHER_CONFIG={
    "enable":true,//global enable
    "crypto":{
        "enable":true,//crypto enable
        "maxDataLength":240,//Maximum length of single data printout
        "printStack":false,
        "aes":true,
        "des":true,
        "3des":true,
        "cast":true,
        "rc4":true,
        "rc2":true,
    },
    "hash":{
        "enable":true,//hash enable
        "maxInputDataLength":240,
        "printStack":false,
        "md2":true,
        "md4":true,
        "md5":true,
        "sha1":true,
        "sha224":true,
        "sha256":true,
        "sha384":true,
        "sha512":true
    },
    "hmac":{
        "enable":true,//hmac enable
        "maxInputDataLength":240,
        "printStack":false,
        "sha1":true,
        "md5":true,
        "sha224":true,
        "sha256":true,
        "sha384":true,
        "sha512":true,
    },
}



//common
const COLORS = {
    "resetColor": "\x1b[0m",
    "green": "\x1b[32m",
    "yellow": "\x1b[33m",
    "red": "\x1b[31m"
};
const CC_MD2_DIGEST_LENGTH = 16
const CC_MD4_DIGEST_LENGTH = 16
const CC_MD5_DIGEST_LENGTH = 16
const CC_SHA1_DIGEST_LENGTH=20;
const CC_SHA224_DIGEST_LENGTH=28;
const CC_SHA256_DIGEST_LENGTH=32;
const CC_SHA384_DIGEST_LENGTH=48;
const CC_SHA512_DIGEST_LENGTH=64;

const CCOperation:{[key:number]:string}={
    0:"kCCEncrypt",
    1:"kCCEncrypt",
};
const CCAlgorithm:{[key:number]:string}={
    0:"kCCAlgorithmAES128",
    1:"kCCAlgorithmDES",
    2:"kCCAlgorithm3DES",
    3:"kCCAlgorithmCAST",
    4:"kCCAlgorithmRC4",
    5:"kCCAlgorithmRC2"
};

const CCOptions:{[key:number]:string}={
    1:"kCCOptionPKCS7Padding",
    2:"kCCOptionECBMode"
};
const CCKeySize:{[key:number]:string}={
    16:"kCCKeySizeAES128|kCCKeySizeMaxCAST",
    24:"kCCKeySizeAES192|kCCKeySize3DES",
    32:"kCCKeySizeAES256",
    8:"kCCKeySizeDES",
    5:"kCCKeySizeMinCAST",
    1:"kCCKeySizeMinRC4|kCCKeySizeMinRC2",
    512:"kCCKeySizeMaxRC4",
    128:"kCCKeySizeMaxRC2"
}
const CCHmacAlgorithm:{[key:number]:string}={
    0:"kCCHmacAlgSHA1",
    1:"kCCHmacAlgMD5",
    2:"kCCHmacAlgSHA256",
    3:"kCCHmacAlgSHA384",
    4:"kCCHmacAlgSHA512",
    5:"kCCHmacAlgSHA224",
}
const CCHmacAlgorithmLength:{[key:number]:number}={
    0:CC_SHA1_DIGEST_LENGTH,
    1:CC_MD5_DIGEST_LENGTH,
    2:CC_SHA256_DIGEST_LENGTH,
    3:CC_SHA384_DIGEST_LENGTH,
    4:CC_SHA512_DIGEST_LENGTH,
    5:CC_SHA224_DIGEST_LENGTH,
}

// @ts-ignore
function print_arg(addr,len=240) {
    try {
        if(addr==null)return "\n";
        return "\n"+hexdump(addr,{length:len}) + "\n";
    } catch (e) {
        console.error("print_arg error:",e.stack);
        return addr + "\n";
    }
}
function pointerToInt(ptr:NativePointer){
    try {
        if(ptr==null)return 0;
        return parseInt(ptr.toString());
    }catch (e){
        console.error("pointerToInt error:",e.stack);
        return 0;
    }
}

//crypto
interface CCCryptorModel{
    enable:boolean,
    cRef:NativePointer,
    dataMap:{
        data:NativePointer,
        len:number
    }[],
    dataOutMap:{
        data:NativePointer,
        len:number,
    }[],
    totalLen:number,
    totalOutLen:number,
    originalLen:number,
    originalOutLen:number,
    log:string
}
function commonCryptoInterceptor() {
    function checkCryptoAlgorithmEnable(algorithm: number) {
        switch (algorithm){
            case 0:
                return CIPHER_CONFIG.crypto.aes;
            case 1:
                return CIPHER_CONFIG.crypto.des;
            case 2:
                return CIPHER_CONFIG.crypto["3des"];
            case 3:
                return CIPHER_CONFIG.crypto.cast;
            case 4:
                return CIPHER_CONFIG.crypto.rc4;
            case 5:
                return CIPHER_CONFIG.crypto.rc2;
            default:
                return true;
        }
    }
    //CCCryptorStatus CCCrypt(
    // 	CCOperation op,			/* kCCEncrypt, etc. */
    // 	CCAlgorithm alg,		/* kCCAlgorithmAES128, etc. */
    // 	CCOptions options,		/* kCCOptionPKCS7Padding, etc. */
    // 	const void *key,
    // 	size_t keyLength,
    // 	const void *iv,			/* optional initialization vector */
    // 	const void *dataIn,		/* optional per op and alg */
    // 	size_t dataInLength,
    // 	void *dataOut,			/* data RETURNED here */
    // 	size_t dataOutAvailable,
    // 	size_t *dataOutMoved);	
    let func=Module.findExportByName("libSystem.B.dylib","CCCrypt");
    if(func==null){
        console.error("CCCrypt func is null");
        return;
    }
    Interceptor.attach(func,
        {
            onEnter: function(args) {
                this.enable=checkCryptoAlgorithmEnable(args[1].toInt32());
                if(!this.enable)return;
                this.log="";
                this.log=this.log.concat(COLORS.green,"[*] ENTER CCCrypt",COLORS.resetColor);
                this.log=this.log.concat(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join("\n"),"\n");
                this.log=this.log.concat(COLORS.yellow,"[+] CCOperation: " + CCOperation[args[0].toInt32()],COLORS.resetColor,"\n");
                this.log=this.log.concat(COLORS.yellow,"[+] CCAlgorithm: " + CCAlgorithm[args[1].toInt32()],COLORS.resetColor,"\n");
                this.log=this.log.concat("[+] CCOptions: " + CCOptions[args[2].toInt32()],"\n");
                this.log=this.log.concat("[+] KeySize: " + CCKeySize[args[4].toInt32()],"\n");
                this.log=this.log.concat("[+] Key: \n" + print_arg(args[3],args[4].toInt32()),"\n");
                this.log=this.log.concat("[+] IV: \n" + print_arg(args[5],16),"\n");
                let dataInLength = pointerToInt(args[7]);
                let printLength=Math.min(dataInLength,CIPHER_CONFIG.crypto.maxDataLength);
                this.log=this.log.concat("[+] Data len: ",printLength,"/",dataInLength,"\n");
                this.log=this.log.concat("[+] Data : \n","\n");
                this.log=this.log.concat(print_arg(args[6],printLength));
                this.dataOut = args[8];
                this.dataOutLength = args[10];

            },

            onLeave: function(retval) {
                if(!this.enable)return;
                let dataOutLen=pointerToInt(this.dataOutLength.readPointer());
                let printOutLen=Math.min(dataOutLen,CIPHER_CONFIG.crypto.maxDataLength);
                this.log=this.log.concat("[+] Data out len: ",printOutLen,"/",dataOutLen,"\n");
                this.log=this.log.concat("[+] Data out: \n",print_arg(this.dataOut,printOutLen),"\n");
                if(CIPHER_CONFIG.crypto.printStack) {
                    this.log = this.log.concat("[+] stack:\n", Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join("\n"), "\n");
                }
                this.log=this.log.concat("[*] EXIT CCCrypt","\n");
            }

        });
    let cRefCache:{[key:number]:CCCryptorModel}={};
    //CCCryptorStatus CCCryptorCreate(CCOperation op, CCAlgorithm alg, CCOptions options, const void *key, size_t keyLength, const void *iv,CCCryptorRef *cryptorRef);
    let CCCryptorCreate=Module.findExportByName("libSystem.B.dylib","CCCryptorCreate");
    if(CCCryptorCreate==null){
        console.error("CCCryptorCreate func is null ")
        return;
    }
    Interceptor.attach(CCCryptorCreate,
        {
            onEnter: function(args) {
                this.cRefPtr=args[6];
                this.operation=args[0];
                this.algorithm=args[1];
                this.options=args[2];
                this.key=args[3];
                this.keyLen=args[4];
                this.iv=args[5];
            },
            onLeave:function (reval) {
                let model:CCCryptorModel={enable:checkCryptoAlgorithmEnable(this.algorithm),cRef:this.cRefPtr.readPointer(),dataMap:[],dataOutMap:[],totalLen:0,totalOutLen:0,originalLen:0,originalOutLen:0,log:""};
                cRefCache[pointerToInt(model.cRef)]=model;
                if(!model.enable)return;
                model.log=model.log.concat("[*] ENTER CCCryptorCreate","\n");
                model.log=model.log.concat("[+] CCOperation: " + CCOperation[this.operation.toInt32()],"\n");
                model.log=model.log.concat("[+] CCAlgorithm: " + CCAlgorithm[this.algorithm.toInt32()],"\n");
                model.log=model.log.concat("[+] CCOptions: " + CCOptions[this.options.toInt32()],"\n");
                model.log=model.log.concat("[+] Key len: " + CCKeySize[this.keyLen.toInt32()],"\n");
                model.log=model.log.concat("[+] Key: \n" + print_arg(this.key,pointerToInt(this.keyLen)),"\n");
                if(pointerToInt(this.iv)!=0){
                    model.log=model.log.concat("[+] Iv:\n" + print_arg(this.iv,16),"\n");
                }else {
                    model.log=model.log.concat(COLORS.red,"[!] Iv: null","\n",COLORS.resetColor);
                }
            }
        });
    //CCCryptorStatus CCCryptorUpdate(CCCryptorRef cryptorRef, const void *dataIn,size_t dataInLength, void *dataOut, size_t dataOutAvailable,size_t *dataOutMoved);
    let CCCryptorUpdate=Module.findExportByName("libSystem.B.dylib","CCCryptorUpdate");
    if(CCCryptorUpdate==null){
        console.error("CCCryptorUpdate func is null");
        return;
    }
    Interceptor.attach(CCCryptorUpdate,
        {
            onEnter: function(args) {
                this.outLen = args[5];
                this.out = args[3];
                this.cRef=args[0];
                this.dataLen=args[2];
                this.data=args[1];
            },

            onLeave: function(retval) {
                let model:CCCryptorModel=cRefCache[pointerToInt(this.cRef)];
                if(model==null){
                    console.error("CCCryptorUpdate model is null");
                    return;
                }
                if(!model.enable)return;
                model.originalLen+=this.dataLen;
                model.originalOutLen+=this.outLen;
                let remainingSpace = CIPHER_CONFIG.crypto.maxDataLength - model.totalLen;
                let dataLen = pointerToInt(this.dataLen);
                if(dataLen>0&&remainingSpace>0){
                    let copyLength = Math.min(dataLen, remainingSpace);
                    let tmpData=Memory.alloc(copyLength);
                    Memory.copy(tmpData,this.data,copyLength);
                    model.dataMap.push({data:tmpData,len:copyLength})
                    model.totalLen+=copyLength;
                }
                let outRemainingSpace = CIPHER_CONFIG.crypto.maxDataLength - model.totalOutLen;
                let outLen=pointerToInt(this.outLen.readPointer());
                if(outLen>0&&outRemainingSpace>0){
                    let copyLength = Math.min(outLen, outRemainingSpace);
                    let tmpDataOut=Memory.alloc(copyLength);
                    Memory.copy(tmpDataOut,this.out,copyLength);
                    model.dataOutMap.push({data:tmpDataOut,len:copyLength});
                    model.totalOutLen+=copyLength;
                }
            }

        });
    //CCCryptorStatus CCCryptorFinal(CCCryptorRef cryptorRef, void *dataOut,size_t dataOutAvailable, size_t *dataOutMoved);
    let CCCryptorFinal=Module.findExportByName("libSystem.B.dylib","CCCryptorFinal");
    if(CCCryptorFinal==null){
        console.error("CCCryptorFinal func is null");
        return;
    }
    Interceptor.attach(CCCryptorFinal,
        {
            onEnter: function(args) {
                this.cRef=args[0];
                this.dataOut=args[1];
                this.dataOutLen=args[3];
            },
            onLeave: function(retval) {
                let model:CCCryptorModel=cRefCache[pointerToInt(this.cRef)];
                if(model==null){
                    console.error("CCCryptorFinal model is null");
                    return;
                }
                if(!model.enable)return;
                model.originalOutLen+=this.dataOutLen;
                if(model.totalOutLen<CIPHER_CONFIG.crypto.maxDataLength){
                    let outRemainingSpace = CIPHER_CONFIG.crypto.maxDataLength - model.totalOutLen;
                    let outLen=pointerToInt(this.dataOutLen.readPointer());
                    if(outLen>0&&outRemainingSpace>0){
                        let copyLength=Math.min(outLen,outRemainingSpace);
                        let tmpDataOut=Memory.alloc(copyLength);
                        Memory.copy(tmpDataOut,this.dataOut,copyLength);
                        model.dataOutMap.push({data:tmpDataOut,len:copyLength});
                        model.totalOutLen+=copyLength;
                    }
                }
                let totalData=Memory.alloc(model.totalLen);
                var offset=0;
                model.dataMap.forEach(function (value){
                    Memory.copy(totalData.add(offset),value.data,value.len)
                    offset+=value.len;
                });
                let totalOutData=Memory.alloc(model.totalOutLen);
                var offsetOut=0;
                model.dataOutMap.forEach(function (value){
                    Memory.copy(totalOutData.add(offsetOut),value.data,value.len)
                    offsetOut+=value.len;
                });
                model.log=model.log.concat("[+] Data len: "+model.totalLen+"/"+model.originalLen+"\n");
                model.log=model.log.concat("[+] Data : \n",print_arg(totalData,model.totalLen),"\n");
                model.log=model.log.concat("[+] Data out len: "+model.totalOutLen+"/"+model.originalOutLen+"\n");
                model.log=model.log.concat("[+] Data out: \n",print_arg(totalOutData,model.totalOutLen),"\n");
                if(CIPHER_CONFIG.crypto.printStack){
                    model.log=model.log.concat("[+] stack:\n",Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join("\n"),"\n");
                }
                model.log=model.log.concat("[*] EXIT CCCryptorFinal ","\n");
                console.log(model.log);
            }

        });

}


//hash
interface CCHashModel{
    ctx:NativePointer,
    dataMap:{
        data:NativePointer,
        len:number }[],
    totalLen:number,
    originalLen:number,
    log:string
}

function commonHashInterceptor(name:string, length:number){
    let hash=Module.findExportByName("libSystem.B.dylib",name);
    if(hash==null){
        console.error(name+" func is null");
        return;
    }
    Interceptor.attach(hash,{
        onEnter:function (args){
            this.log="";
            this.log=this.log.concat("[*] ENTER ",name,"\n");
            let dataLen=args[1].toInt32();
            let printLen=Math.min(dataLen,CIPHER_CONFIG.hash.maxInputDataLength);
            this.log=this.log.concat("[+] Data len:",printLen,"/",dataLen,"\n");
            this.log=this.log.concat("[+] Data: \n",print_arg(args[0],printLen),"\n")

        },
        onLeave:function (reval){
            this.log=this.log.concat(COLORS.green,"[+] Data out len: "+length,COLORS.resetColor,"\n");
            this.log=this.log.concat(COLORS.green,"[+] Data out:\n",print_arg(reval,length),COLORS.resetColor,"\n");
            if(CIPHER_CONFIG.hash.printStack){
                this.log=this.log.concat("[+] stack:\n",Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join("\n"),"\n");
            }
            this.log=this.log.concat("[*] EXIT",name,"\n");
            console.log(this.log);
        }
    });
    (function (){
        let ctxCache :{[key:number]:CCHashModel}={}
        //CC_SHA1_Init(CC_SHA1_CTX *c);
        let init=Module.findExportByName("libSystem.B.dylib",name+"_Init");
        if (init==null){
            console.error(name+"_Init func is null")
            return;
        }
        Interceptor.attach(init,
            {
                onEnter: function(args) {
                    let model={ctx:args[0],dataMap:[],totalLen:0,originalLen:0,log:""};
                    ctxCache[pointerToInt(args[0])]=model;
                    model.log=model.log.concat("[*] ENTER "+name+"_Init\n");
                }
            });

        //CC_SHA1_Update(CC_SHA1_CTX *c, const void *data, CC_LONG len);
        let update=Module.findExportByName("libSystem.B.dylib",name+"_Update");
        if(update==null){
            console.error(name+"_Update func is null");
            return;
        }
        Interceptor.attach(update,
            {
                onEnter: function(args) {
                    let model=ctxCache[pointerToInt(args[0])];
                    if(model==null){
                        console.error("model is null");
                        return;
                    }
                    let len=pointerToInt(args[2]);
                    let remainingSpace=CIPHER_CONFIG.hash.maxInputDataLength-model.totalLen;
                    if(len>0&&remainingSpace>0){
                        model.originalLen+=len;
                        let copyLen=Math.min(len,remainingSpace);
                        let tmpData=Memory.alloc(copyLen);
                        Memory.copy(tmpData,args[1],copyLen);
                        model.dataMap.push({data:tmpData,len:copyLen});
                        model.totalLen+=copyLen;
                    }

                }
            });

        //CC_SHA1_Final(unsigned char *md, CC_SHA1_CTX *c);
        let final=Module.findExportByName("libSystem.B.dylib",name+"_Final");
        if(final==null){
            console.error(name+"_Final func is null");
            return;
        }
        Interceptor.attach(final,
            {
                onEnter: function(args) {
                    this.mdSha = args[0];
                    this.ctxSha = args[1];
                },
                onLeave: function(retval) {
                    let model=ctxCache[pointerToInt(this.ctxSha)];
                    if(model==null){
                        console.error(name+"_Final model is null");
                        return;
                    }
                    if(model.totalLen<=0){
                        console.error("totalLen :",model.totalLen);
                        return;
                    }
                    let totalData=Memory.alloc(model.totalLen);
                    var offset=0;
                    model.dataMap.forEach(function (value){
                        Memory.copy(totalData.add(offset),value.data,value.len)
                        offset+=value.len;
                    });
                    model.log=model.log.concat("[+] Data len: "+model.totalLen+"/"+model.originalLen+"\n");
                    model.log=model.log.concat("[+] Data :\n");
                    model.log=model.log.concat(print_arg(totalData,model.totalLen),"\n");

                    if(pointerToInt(this.mdSha) !== 0) {
                        model.log=model.log.concat(COLORS.green,"[+] Data out len: "+length+"\n");
                        model.log=model.log.concat("[+] Data out:\n");
                        model.log=model.log.concat(print_arg(ptr(this.mdSha),length),"\n",COLORS.resetColor);
                    } else {
                        model.log=model.log.concat(COLORS.red,"[!]: Data out: null\n",COLORS.resetColor);
                    }
                    if(CIPHER_CONFIG.hash.printStack){
                        model.log=model.log.concat("[+] stack:\n",Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join("\n"),"\n");
                    }
                    model.log=model.log.concat("[*] EXIT "+name+"_Final"+"\n");

                    console.log(model.log);
                }
            });
    })();
}

//hmac

interface CCHMacModel extends CCHashModel{
    mdLen:number,
    enable:boolean,
}
function commonHMACInterceptor(){
    function checkHMACAlgorithmEnable(algorithm: number) {
        switch (algorithm){
            case 0:
                return CIPHER_CONFIG.hmac.sha1;
            case 1:
                return CIPHER_CONFIG.hmac.md5;
            case 2:
                return CIPHER_CONFIG.hmac.sha256;
            case 3:
                return CIPHER_CONFIG.hmac.sha384;
            case 4:
                return CIPHER_CONFIG.hmac.sha512;
            case 5:
                return CIPHER_CONFIG.hmac.sha224;
            default:
                return true;
        }
    }
    let name="CCHmac";
    //void CCHmac(CCHmacAlgorithm algorithm, const void *key, size_t keyLength,const void *data, size_t dataLength, void *macOut);
    let hmac=Module.findExportByName("libSystem.B.dylib",name);
    if(hmac==null){
        console.error(name+" func is null");
        return;
    }
    Interceptor.attach(hmac,{
        onEnter:function (args){
            this.enable=checkHMACAlgorithmEnable(args[0].toInt32());
            if(!this.enable)return;
            this.mdLen=CCHmacAlgorithmLength[args[0].toInt32()];
            this.log="";
            this.log=this.log.concat("[*] ENTER ",name,"\n");
            this.log=this.log.concat(COLORS.yellow,"[+] Algorithm: ",CCHmacAlgorithm[args[0].toInt32()],"\n",COLORS.resetColor);
            this.log=this.log.concat("[+] Key len: ",args[2].toInt32(),"\n");
            this.log=this.log.concat(COLORS.green,"[+] Key : \n",print_arg(args[1],args[2].toInt32()),"\n",COLORS.resetColor);

            let dataLen=args[4].toInt32();
            let printLen=Math.min(dataLen,CIPHER_CONFIG.hmac.maxInputDataLength);
            this.log=this.log.concat("[+] Data len:",printLen,"/",dataLen,"\n");
            this.log=this.log.concat("[+] Data: \n",print_arg(args[3],printLen),"\n")
            this.macOut=args[5];
        },
        onLeave:function (reval){
            if(!this.enable)return;
            this.log=this.log.concat("[+] Data out len: "+this.mdLen,"\n");
            this.log=this.log.concat(COLORS.green,"[+] Data out:\n",print_arg(reval,this.mdLen),COLORS.resetColor,"\n");
            if(CIPHER_CONFIG.hmac.printStack){
                this.log=this.log.concat("[+] stack:\n",Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join("\n"),"\n");
            }
            this.log=this.log.concat("[*] EXIT",name,"\n");
            console.log(this.log);
        }
    });
    (function (){
        let ctxCache :{[key:number]:CCHMacModel}={}
        //void
        //      CCHmacInit(CCHmacContext *ctx, CCHmacAlgorithm algorithm,
        //          const void *key, size_t keyLength);
        let init=Module.findExportByName("libSystem.B.dylib",name+"Init");
        if(init==null){
            console.error(name+"Init func is null");
            return;
        }
        Interceptor.attach(init,
            {
                onEnter: function(args) {
                    let model={ctx:args[0],dataMap:[],totalLen:0,originalLen:0,log:"",mdLen:CCHmacAlgorithmLength[args[1].toInt32()],enable:checkHMACAlgorithmEnable(args[1].toInt32())};
                    ctxCache[pointerToInt(args[0])]=model;
                    if(!model.enable)return;
                    model.log=model.log.concat("[*] ENTER "+name+"Init\n");
                    model.log=model.log.concat(COLORS.yellow,"[+] Algorithm: "+CCHmacAlgorithm[args[1].toInt32()]+"\n",COLORS.resetColor);
                    model.log=model.log.concat("[+] Key len: "+args[3].toInt32()+"\n");
                    model.log=model.log.concat(COLORS.green,"[+] Key: \n"+print_arg(args[2],pointerToInt(args[3]))+"\n",COLORS.resetColor);
                }
            });

        //void
        //      CCHmacUpdate(CCHmacContext *ctx, const void *data, size_t dataLength);
        let update=Module.findExportByName("libSystem.B.dylib",name+"Update");
        if(update==null){
            console.error(name+"Update func is null");
            return;
        }
        Interceptor.attach(update,
            {
                onEnter: function(args) {
                    let model=ctxCache[pointerToInt(args[0])];
                    if(model==null){
                        console.error(name+"Update model is null");
                        return;
                    }
                    if(!model.enable)return;
                    let len=pointerToInt(args[2]);
                    let remainingSpace=CIPHER_CONFIG.hmac.maxInputDataLength-model.totalLen;
                    if(len>0&&remainingSpace>0){
                        model.originalLen+=len;
                        let copyLen=Math.min(len,remainingSpace);
                        let tmpData=Memory.alloc(copyLen);
                        Memory.copy(tmpData,args[1],copyLen);
                        model.dataMap.push({data:tmpData,len:copyLen});
                        model.totalLen+=copyLen;
                    }

                }
            });

        //void
        //      CCHmacFinal(CCHmacContext *ctx, void *macOut);
        let final=Module.findExportByName("libSystem.B.dylib",name+"Final");
        if(final==null){
            console.error(name+"Final func is null");
            return;
        }
        Interceptor.attach(final,
            {
                onEnter: function(args) {
                    this.mdOut = args[1];
                    this.ctx = args[0];
                },
                onLeave: function(retval) {
                    let model=ctxCache[pointerToInt(this.ctx)];
                    if(model==null){
                        console.error(name+"Final model is null");
                        return;
                    }
                    if(!model.enable)return;
                    if(model.totalLen<=0){
                        console.error("totalLen :",model.totalLen);
                        return;
                    }
                    let totalData=Memory.alloc(model.totalLen);
                    var offset=0;
                    model.dataMap.forEach(function (value){
                        Memory.copy(totalData.add(offset),value.data,value.len)
                        offset+=value.len;
                    });
                    model.log=model.log.concat("[+] Data len: "+model.totalLen+"/"+model.originalLen+"\n");
                    model.log=model.log.concat("[+] Data :\n");
                    model.log=model.log.concat(print_arg(totalData,model.totalLen),"\n");

                    model.log=model.log.concat("[+] Data out len: "+model.mdLen+"\n");
                    model.log=model.log.concat(COLORS.green,"[+] Data out:\n");
                    model.log=model.log.concat(print_arg(ptr(this.mdOut),model.mdLen),COLORS.resetColor,"\n");
                    if(CIPHER_CONFIG.hmac.printStack){
                        model.log=model.log.concat("[+] stack:\n",Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join("\n"),"\n");
                    }
                    model.log=model.log.concat("[*] EXIT "+name+"Final"+"\n");

                    console.log(model.log);
                }
            });
    })();
}


//start
(function (){
    if(!CIPHER_CONFIG.enable){
        return
    }
    if(CIPHER_CONFIG.crypto.enable){
        commonCryptoInterceptor();
    }
    if(CIPHER_CONFIG.hash.enable){
        if(CIPHER_CONFIG.hash.sha1){
            //extern unsigned char *CC_SHA1(const void *data, CC_LONG len, unsigned char *md)
            commonHashInterceptor("CC_SHA1",20);
        }
        if(CIPHER_CONFIG.hash.sha224){
            //extern unsigned char *CC_SHA224(const void *data, CC_LONG len, unsigned char *md);
            commonHashInterceptor("CC_SHA224",28);
        }
        if(CIPHER_CONFIG.hash.sha256){
            //extern unsigned char *CC_SHA256(const void *data, CC_LONG len, unsigned char *md);
            commonHashInterceptor("CC_SHA256",32);
        }
        if(CIPHER_CONFIG.hash.sha384){
            //extern unsigned char *CC_SHA384(const void *data, CC_LONG len, unsigned char *md);
            commonHashInterceptor("CC_SHA384",48);
        }
        if(CIPHER_CONFIG.hash.sha512){
            //extern unsigned char *CC_SHA512(const void *data, CC_LONG len, unsigned char *md);
            commonHashInterceptor("CC_SHA512",64);
        }
        if(CIPHER_CONFIG.hash.md2){
            //extern unsigned char *CC_MD2(const void *data, CC_LONG len, unsigned char *md);
            commonHashInterceptor("CC_MD2",16);
        }
        if(CIPHER_CONFIG.hash.md4){
            //extern unsigned char *CC_MD4(const void *data, CC_LONG len, unsigned char *md);
            commonHashInterceptor("CC_MD4",16);
        }
        if(CIPHER_CONFIG.hash.md5){
            //extern unsigned char *CC_MD5(const void *data, CC_LONG len, unsigned char *md);
            commonHashInterceptor("CC_MD5",16);
        }
        if(CIPHER_CONFIG.hmac.enable){
            commonHMACInterceptor();
        }

    }
})();














