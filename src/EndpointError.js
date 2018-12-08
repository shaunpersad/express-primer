
class EndpointError extends Error {

    constructor(code = 500, message = 'An internal error occurred.', details = {}) {

        super(message);

        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
        this.code = code;
        this.details = details;
    }

    toJSON() {

        return {
            code: this.code,
            message: this.message,
            details: this.details
        };
    }
}

module.exports = EndpointError;

