const EndpointError = require('./EndpointError');

class ValidationError extends EndpointError {

    constructor(errors = {}, message = 'This request is not valid.', code = 400) {

        super(code, message, errors);
    }
}

module.exports = ValidationError;