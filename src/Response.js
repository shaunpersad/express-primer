class Response {

    constructor(body = '', code = 200, headers = {}) {
        this.body = body;
        this.code = code;
        this.headers = headers;
    }
}

module.exports = Response;
