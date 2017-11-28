/**
 * Created by francis.peng on 11/14/17.
 */



(function (exports, ByteArray) {
    var PKG_HEAD_BYTES = 4;

    var Protocol = exports;
    Protocol.Message = {};
    Protocol.TYPE_HANDSHAKE = 0x01
    Protocol.TYPE_HANDSHAKE_ACK = 0x02
    Protocol.TYPE_HEARTBEAT = 0x03
    Protocol.TYPE_KICK = 0x04
    //real data
    Protocol.TYPE_DATA_REQUEST = 0x05
    Protocol.TYPE_DATA_RESPONSE = 0x06
    Protocol.TYPE_DATA_NOTIFY = 0x07
    Protocol.TYPE_DATA_PUSH = 0x08


    Protocol.encode = function (packageType, data) {
        var buffer = new ByteArray(PKG_HEAD_BYTES + data.length);
        var index = 0;
        var length = data.length;
        buffer[index++] = packageType & 0xff;
        buffer[index++] = (length >> 16) & 0xff;
        buffer[index++] = (length >> 8) & 0xff;
        buffer[index++] = length & 0xff;

        if(data) {
            copyArray(buffer, index, data, 0, length);
        }

        return buffer;
    };

    Protocol.decode = function (bytes) {
        var index = 0;
        var type = bytes[index++];
        var length = ((bytes[index++]) << 16 | (bytes[index++]) << 8 | bytes[index++]) >>> 0;
        var body = new ByteArray(length);

        copyArray(body, 0, bytes, PKG_HEAD_BYTES, length);
        return {'type': type, 'body': body};
    };

    Protocol.getHeadLength = function () {
        return 4;
    }

    Protocol.getBodyLength = function (bytes) {
        var index = 1;
        var length = ((bytes[index++]) << 16 | (bytes[index++]) << 8 | bytes[index++]) >>> 0;
        return length;
    }

    Protocol.Message.encode = function (msgId, routeId, data) {
        if(data) {
            data = strencode(data)
        }
        var msgIdBuffer = encodeNumBytes(msgId)
        var routeIdBuffer = encodeNumBytes(routeId)
        var msgIdLen = getNumBytes(msgId)
        var routeIdLen = getNumBytes(routeId)

        var buffer = new ByteArray(msgIdLen  + routeIdLen + data.length)

        copyArray(buffer, 0,  msgIdBuffer, 0, msgIdBuffer.length)
        copyArray(buffer, msgIdLen, routeIdBuffer, 0, routeIdBuffer.length)

        copyArray(buffer, (msgIdLen + routeIdLen), data, 0, data.length)

        return buffer;
    };

    Protocol.Message.decode = function (data) {
        var count = 1, offset = 0;

        do {
            count++;
            offset++;
        }while(data[offset-1] >= 0x80)


        var msgId = 0;
        var idx = 0;
        for(var i = 0; i < count; i++) {
            idx = offset - (count-i);
            var val = data[idx]

            var mid = (val & 0x7f) * Math.pow(2, (7 * (count - i - 1)))
            msgId = msgId + mid
        }


        count = 0
        do {
            count++;
            offset++;
        }while(data[offset-1] >= 0x80)

        var routeId = 0;
        for(var i = 0; i < count; i++) {
            idx = offset - (count-i);
            var val = data[idx]

            var mid = (val & 0x7f) * Math.pow(2, (7 * (count - i - 1)))
            routeId = routeId + mid
        }


        var body = data.slice(offset);
        body = strdecode(body)

        return {
            msgId: msgId,
            routeId: routeId,
            body: body
        }
    };


    var copyArray = function (dest, doffset, src, soffset, length) {
        if('function' === typeof src.copy) {
            // Buffer
            src.copy(dest, doffset, soffset, soffset + length);
        } else {
            // Uint8Array
            for(var index=0; index<length; index++){
                dest[doffset++] = src[soffset++];
            }
        }
    }
    
    var getNumBytes = function (num) {
        var length = 0;
        while (num > 0) {
            length += 1;
            num >>= 7;
        }
        return length;
    }
    
    var encodeNumBytes = function (num) {
        var left = 0, right = 0;
        var temp = [];
        var count = 0;
        while(num > 0) {
            left = num & 0x7f;
            right = num >> 7;
            temp[count++] = left | 0x80;
            num = right;
        }
        temp[0] = 0x7f & temp[0];

        //reverse
        return temp.reverse();
    }


    var strencode = function(str) {
        var byteArray = new ByteArray(str.length * 3);
        var offset = 0;
        for(var i = 0; i < str.length; i++){
            var charCode = str.charCodeAt(i);
            var codes = null;
            if(charCode <= 0x7f){
                codes = [charCode];
            }else if(charCode <= 0x7ff){
                codes = [0xc0|(charCode>>6), 0x80|(charCode & 0x3f)];
            }else{
                codes = [0xe0|(charCode>>12), 0x80|((charCode & 0xfc0)>>6), 0x80|(charCode & 0x3f)];
            }
            for(var j = 0; j < codes.length; j++){
                byteArray[offset] = codes[j];
                ++offset;
            }
        }
        var _buffer = new ByteArray(offset);
        copyArray(_buffer, 0, byteArray, 0, offset);
        return _buffer;
    };


    var strdecode = function(buffer) {
        var bytes = new ByteArray(buffer);
        var array = [];
        var offset = 0;
        var charCode = 0;
        var end = bytes.length;
        while(offset < end){
            if(bytes[offset] < 128){
                charCode = bytes[offset];
                offset += 1;
            }else if(bytes[offset] < 224){
                charCode = ((bytes[offset] & 0x3f)<<6) + (bytes[offset+1] & 0x3f);
                offset += 2;
            }else{
                charCode = ((bytes[offset] & 0x0f)<<12) + ((bytes[offset+1] & 0x3f)<<6) + (bytes[offset+2] & 0x3f);
                offset += 3;
            }
            array.push(charCode);
        }
        return String.fromCharCode.apply(null, array);
    };


})('object' === typeof module ? module.exports : (this.protocol = {}), 'object' === typeof module ? Buffer : Uint8Array);





