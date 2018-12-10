
class EndpointError extends Error {

    constructor(message = 'An internal error occurred.', code = 500, details = {}) {

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

