const Ajv = require('ajv');
const EndpointError = require('./EndpointError');
const ValidationError = require('./ValidationError');
const Response = require('./Response');


class Endpoint {

    constructor() {

        this.options = this.constructor.defaultOptions();
    }

    /**
     *
     * @returns {object|null}
     */
    operation() {
        return null;
    }
    /**
     *
     * @returns {object|null}
     */
    querySchema() {
        return null;
    }
    /**
     *
     * @returns {object|null}
     */
    bodySchema() {
        return null;
    }
    /**
     *
     * @returns {object|null}
     */
    paramsSchema() {
        return null;
    }
    /**
     *
     * @returns {object|null}
     */
    headersSchema() {
        return null;
    }
    /**
     *
     * @returns {object|null}
     */
    cookiesSchema() {
        return null;
    }
    /**
     *
     * @returns {object|null}
     */
    signedCookiesSchema() {
        return null;
    }
    /**
     *
     * @returns {object|null}
     */
    responseCodeSchemas() {
        return null;
    }

    requestSchema() {

        const required = ['query', 'params', 'headers', 'cookies', 'signedCookies'];
        const bodySchema = this.bodySchema();
        if (bodySchema) {
            required.push('body');
        }

        return {
            type: 'object',
            properties: {
                query: this.querySchema() || {},
                params: this.paramsSchema() || {},
                headers: this.headersSchema() || {},
                cookies: this.cookiesSchema() || {},
                signedCookies: this.signedCookiesSchema() || {},
                bodySchema: bodySchema || {}
            },
            required
        };
    }

    handler(req) {
        throw new Error('Please provide a handler for this endpoint.');
    }

    createRequestValidator(defsSchema) {

        const ajv = new Ajv(this.options.requestAjvOptions);
        const requestSchema = this.requestSchema() || {};
        return ajv.addSchema(defsSchema).compile(requestSchema);
    }

    createResponseValidators(defsSchema) {

        const ajv = new Ajv(this.options.responseAjvOptions);
        const schemas = this.responseCodeSchemas() || {};

        return Object.keys(schemas).reduce((validators, code) => {

            validators[`${code}`] = ajv.addSchema(defsSchema).compile(schemas[code]);

            return validators;

        }, {});
    }

    createMiddleware(defsSchema) {

        const requestValidator = this.createRequestValidator(defsSchema);
        const responseValidators = this.createResponseValidators(defsSchema);
        const { defaultResponseCode, defaultResponseHeaders, validateResponse } = this.options;

        return (req, res, next) => {

            if (!requestValidator(req)) {
                return next(new ValidationError(requestValidator.errors));
            }

            Promise.resolve(req)
                .then(req => this.handler(req))
                .then(body => {

                    if (body instanceof Response) {
                        return body;
                    }

                    return new Response(body, defaultResponseCode, defaultResponseHeaders);
                })
                .then(/** @param {Response} response */ response => {

                    const responseValidator = responseValidators[`${response.code}`];

                    if (validateResponse && responseValidator && !responseValidator(response.body)) {
                        throw new ValidationError(responseValidator.errors, 500, 'Response was not in the expected format.');
                    }

                    res.set(response.headers);
                    res.status(response.code).send(response.body);
                })
                .catch(next);

        };
    }

    static errorHandler(err, req, res, next) {

        if (!(err instanceof EndpointError)) {
            err = new EndpointError();
        }

        if (res.headersSent) {
            return next(err);
        }

        res.status(err.code).send(err);
    }

    /**
     *
     * @param {string} ref
     * @returns {{$ref: string}}
     */
    static referenceSchema(ref) {

        return { $ref: `#/components/schemas/${ref}` };
    }

    static objectSchema(properties = {}, required = null) {

        if (!required) {
            required = Object.keys(properties);
        }

        return {
            type: 'object',
            properties,
            required
        };
    }

    static defaultOptions() {

        return {
            requestAjvOptions: {
                useDefaults: true,
                coerceTypes: true
            },
            responseAjvOptions: {
                useDefaults: true,
                coerceTypes: true
            },
            validateResponse: false,
            successResponseCodes: [ 200 ],
            defaultResponseCode: 200,
            defaultResponseMediaType: 'application/json',
            defaultRequestBodyMediaType: 'application/json',
            requestBodyRequiredIfHasSchema: true,
            responseHeaders: {}
        };
    }

    static withDefaultOptions(options = {}) {

        return class extends this {

            static defaultOptions() {

                return Object.assign({}, super.defaultOptions(), options);
            }
        }
    }
}

module.exports = Endpoint;
