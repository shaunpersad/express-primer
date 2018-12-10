const Ajv = require('ajv');
const EndpointError = require('./EndpointError');
const ValidationError = require('./ValidationError');
const Response = require('./Response');

const { OPEN_API_REFERENCE_ID } = require('./constants');

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

    /**
     * @returns {{type: string, properties: {}, required: []}}
     */
    requestSchema() {

        return this.options.requestPropertiesToValidate.reduce((schema, property) => {

            const propertySchema = this[`${property}Schema`]();
            if (propertySchema) {
                schema.required.push(property);
            }

            schema.properties[property] = propertySchema || {};

            return schema;

        }, {
            type: 'object',
            properties: {},
            required: []
        });
    }

    /**
     *
     * @param req
     */
    handler(req) {
        throw new Error('Please provide a handler for this endpoint.');
    }

    createRequestValidator(spec) {

        const ajv = new Ajv(this.options.requestAjvOptions);
        const requestSchema = this.requestSchema() || {};
        return ajv.addSchema(spec, OPEN_API_REFERENCE_ID).compile(requestSchema);
    }

    createResponseValidators(spec) {

        const schemas = this.responseCodeSchemas() || {};

        return Object.keys(schemas).reduce((validators, code) => {

            const ajv = new Ajv(this.options.responseAjvOptions);
            validators[`${code}`] = ajv.addSchema(spec, OPEN_API_REFERENCE_ID).compile(schemas[code]);

            return validators;

        }, {});
    }

    /**
     *
     * @param {{}} [spec]
     * @returns {function}
     */
    createMiddleware(spec = {}) {

        const requestValidator = this.createRequestValidator(spec);
        const responseValidators = this.createResponseValidators(spec);
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
                        throw new ValidationError(responseValidator.errors, 'Response was not in the expected format.', 500);
                    }

                    res.set(response.headers);
                    res.status(response.code).send(response.body);
                })
                .catch(next);

        };
    }

    /**
     *
     * @param {string} ref
     * @returns {{$ref: string}}
     */
    static openApiReference(ref) {

        return { $ref: `${OPEN_API_REFERENCE_ID}${ref}` };
    }

    /**
     *
     * @param {{}} properties
     * @param {[]|null} required
     * @returns {{type: string, properties, required: *}}
     */
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

    /**
     *
     * @returns {{requestAjvOptions: {useDefaults: boolean, coerceTypes: boolean}, responseAjvOptions: {useDefaults: boolean, coerceTypes: boolean}, validateResponse: boolean, defaultResponseCode: number, defaultResponseMediaType: string, defaultRequestBodyMediaType: string, requestPropertiesToValidate: string[], requestBodyRequiredIfHasSchema: boolean, responseHeaders: {}}}
     */
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
            defaultResponseCode: 200,
            defaultResponseMediaType: 'application/json',
            defaultRequestBodyMediaType: 'application/json',
            requestPropertiesToValidate: ['query', 'params', 'headers', 'cookies', 'signedCookies'],
            requestBodyRequiredIfHasSchema: true,
            responseHeaders: {}
        };
    }

    /**
     *
     * @param {{}} options
     */
    static withDefaultOptions(options = {}) {

        return class extends this {

            static defaultOptions() {

                return Object.assign(super.defaultOptions(), options);
            }
        }
    }

    /**
     *
     * @param handler
     */
    static withHandler(handler) {

        return class extends this {

            handler(req) {

                return handler.call(this, req);
            }
        }
    }
}

module.exports = Endpoint;
