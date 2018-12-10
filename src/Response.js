class Response {

    constructor(body = '', code = this.constructor.defaultStatusCode(), headers = this.constructor.defaultHeaders()) {
        this.body = body;
        this.code = code;
        this.headers = headers;
    }

    static defaultStatusCode() {
        return 200;
    }

    static defaultHeaders() {
        return {};
    }
}

module.exports = Response;
