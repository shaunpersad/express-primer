const httpMocks = require('node-mocks-http');
const { expect } = require('chai');
const { EventEmitter } = require('events');
const { constants, Endpoint, EndpointError, Response, ValidationError } = require('../index');
const { OPEN_API_REFERENCE_ID } = constants;

describe('Endpoint', function() {

    describe('behavior', function() {

        it('converts promise-based handlers to express-style middleware', function(done) {

            const body = 'hi';
            const TestEndpoint = class extends Endpoint {

                handler(req) {

                    return body;
                }
            };

            const endpoint = new TestEndpoint();
            const middleware = endpoint.createMiddleware();
            const req = httpMocks.createRequest();
            const res = httpMocks.createResponse({
                eventEmitter: EventEmitter
            });
            res.on('end', () => {

                expect(res._getData()).to.equal(body);
                expect(res._getHeaders()).to.deep.equal(Response.defaultHeaders());
                expect(res._getStatusCode()).to.equal(Response.defaultStatusCode());
                done();
            });
            const next = (err) => {

                if (err) {
                    return done(err);
                }

                done(new Error('This should not be called.'));
            };

            middleware(req, res, next);
        });

        it('accepts promises resolved by the handler', function(done) {

            const body = 'hi';
            const TestEndpoint = class extends Endpoint {

                handler(req) {

                    return Promise.resolve(body);
                }
            };

            const endpoint = new TestEndpoint();
            const middleware = endpoint.createMiddleware();
            const req = httpMocks.createRequest();
            const res = httpMocks.createResponse({
                eventEmitter: EventEmitter
            });
            res.on('end', () => {

                expect(res._getData()).to.equal(body);
                expect(res._getHeaders()).to.deep.equal(Response.defaultHeaders());
                expect(res._getStatusCode()).to.equal(Response.defaultStatusCode());
                done();
            });
            const next = (err) => {

                if (err) {
                    return done(err);
                }

                done(new Error('This should not be called.'));
            };

            middleware(req, res, next);

        });

        it('forwards errors to express', function(done) {

            const error = new Error('explosion!');
            const TestEndpoint = class extends Endpoint {

                handler(req) {

                    throw error;
                }
            };

            const endpoint = new TestEndpoint();
            const middleware = endpoint.createMiddleware();
            const req = httpMocks.createRequest();
            const res = httpMocks.createResponse({
                eventEmitter: EventEmitter
            });
            res.on('end', () => {

                done(new Error('This should not be called.'));
            });
            const next = (err) => {

                expect(err).to.equal(error);
                done();
            };

            middleware(req, res, next);
        });

        it('accepts promises rejected by the handler', function(done) {

            const error = new Error('explosion!');
            const TestEndpoint = class extends Endpoint {

                handler(req) {

                    return Promise.reject(error);
                }
            };

            const endpoint = new TestEndpoint();
            const middleware = endpoint.createMiddleware();
            const req = httpMocks.createRequest();
            const res = httpMocks.createResponse({
                eventEmitter: EventEmitter
            });
            res.on('end', () => {

                done(new Error('This should not be called.'));
            });
            const next = (err) => {

                expect(err).to.equal(error);
                done();
            };

            middleware(req, res, next);
        });

        it('accepts Response objects', function(done) {

            const body = 'hi';
            const TestEndpoint = class extends Endpoint {

                handler(req) {

                    return new Response(body);
                }
            };

            const endpoint = new TestEndpoint();
            const middleware = endpoint.createMiddleware();
            const req = httpMocks.createRequest();
            const res = httpMocks.createResponse({
                eventEmitter: EventEmitter
            });
            res.on('end', () => {

                expect(res._getData()).to.equal(body);
                expect(res._getHeaders()).to.deep.equal(Response.defaultHeaders());
                expect(res._getStatusCode()).to.equal(Response.defaultStatusCode());
                done();
            });
            const next = (err) => {

                if (err) {
                    return done(err);
                }

                done(new Error('This should not be called.'));
            };

            middleware(req, res, next);

        });

        it('accepts Response objects with custom status code and headers', function(done) {

            const body = 'hi';
            const code = 201;
            const headers = { a: 'b' };
            const TestEndpoint = class extends Endpoint {

                handler(req) {

                    return new Response(body, code, headers);
                }
            };

            const endpoint = new TestEndpoint();
            const middleware = endpoint.createMiddleware();
            const req = httpMocks.createRequest();
            const res = httpMocks.createResponse({
                eventEmitter: EventEmitter
            });
            res.on('end', () => {

                expect(res._getData()).to.equal(body);
                expect(res._getHeaders()).to.deep.equal(headers);
                expect(res._getStatusCode()).to.equal(code);
                done();
            });
            const next = (err) => {

                if (err) {
                    return done(err);
                }

                done(new Error('This should not be called.'));
            };

            middleware(req, res, next);

        });

        it('creates an error if the handler has not been extended', function(done) {

            const TestEndpoint = class extends Endpoint {};

            const endpoint = new TestEndpoint();
            const middleware = endpoint.createMiddleware();
            const req = httpMocks.createRequest();
            const res = httpMocks.createResponse({
                eventEmitter: EventEmitter
            });
            res.on('end', () => {

                done(new Error('This should not be called.'));
            });
            const next = (err) => {

                expect(err).to.be.instanceOf(Error);
                done();
            };

            middleware(req, res, next);
        });

        it(`validates the ${Endpoint.defaultOptions().requestPropertiesToValidate.join(', ')} request properties`, function(done) {

            const body = 'hi';
            const passingParams = {
                a: 'bar',
                b: 2,
                c: 'foo'
            };
            const failingParams = [
                {},
                {
                    a: {},
                    b: 2,
                    c: 'foo'
                },
                {
                    a: 'bar',
                    b: 6,
                    c: 'foo'
                },
                {
                    a: 'bar',
                    b: 2,
                    c: 'baz'
                }
            ];

            const schema = Endpoint.objectSchema({
                a: {
                    type: 'string'
                },
                b: {
                    type: 'integer',
                    maximum: 5
                },
                c: {
                    type: 'string',
                    const: 'foo'
                }
            });

            const TestEndpoint = class extends Endpoint {

                querySchema() {
                    return schema;
                }
                bodySchema() {
                    return schema;
                }
                paramsSchema() {
                    return schema;
                }
                headersSchema() {
                    return schema;
                }
                cookiesSchema() {
                    return schema;
                }
                signedCookiesSchema() {
                    return schema;
                }

                handler(req) {

                    return body;
                }
            };

            const passing = new Promise((resolve, reject) => {

                const endpoint = new TestEndpoint();
                const middleware = endpoint.createMiddleware();
                const req = httpMocks.createRequest({
                    query: passingParams,
                    body: passingParams,
                    params: passingParams,
                    headers: passingParams,
                    cookies: passingParams,
                    signedCookies: passingParams
                });
                const res = httpMocks.createResponse({
                    eventEmitter: EventEmitter
                });
                res.on('end', () => {

                    expect(res._getData()).to.equal(body);
                    expect(res._getHeaders()).to.deep.equal(Response.defaultHeaders());
                    expect(res._getStatusCode()).to.equal(Response.defaultStatusCode());
                    resolve();
                });
                const next = (err) => {

                    if (err) {
                        return reject(err);
                    }

                    reject(new Error('This should not be called.'));
                };

                middleware(req, res, next);
            });

            const failing = Promise.all(failingParams.map(params => {

                return new Promise((resolve, reject) => {

                    const endpoint = new TestEndpoint();
                    const middleware = endpoint.createMiddleware();
                    const req = httpMocks.createRequest({
                        query: params,
                        body: params,
                        params: params,
                        headers: params,
                        cookies: params,
                        signedCookies: params
                    });
                    const res = httpMocks.createResponse({
                        eventEmitter: EventEmitter
                    });
                    res.on('end', () => {
                        reject(new Error('This should not be called.'));
                    });
                    const next = (err) => {

                        expect(err).to.be.instanceOf(ValidationError);
                        resolve();
                    };

                    middleware(req, res, next);
                });

            }));

            Promise.all([ passing, failing ])
                .then(() => done())
                .catch(done);

        });

        it('can reference schemas found in the OpenAPI spec', function(done) {

            const body = 'hi';
            const passingParams = {
                a: 'bar',
                b: 2,
                c: 'foo'
            };
            const failingParams = [
                {},
                {
                    a: {},
                    b: 2,
                    c: 'foo'
                },
                {
                    a: 'bar',
                    b: 6,
                    c: 'foo'
                },
                {
                    a: 'bar',
                    b: 2,
                    c: 'baz'
                }
            ];

            const definitions = {
                foo: {
                    bar: Endpoint.objectSchema({
                        a: {
                            type: 'string'
                        },
                        b: {
                            type: 'integer',
                            maximum: 5
                        },
                        c: {
                            type: 'string',
                            const: 'foo'
                        }
                    })
                }
            };

            const schema = Endpoint.openApiReference('#/foo/bar');

            const TestEndpoint = class extends Endpoint {

                querySchema() {
                    return schema;
                }
                bodySchema() {
                    return schema;
                }
                paramsSchema() {
                    return schema;
                }
                headersSchema() {
                    return schema;
                }
                cookiesSchema() {
                    return schema;
                }
                signedCookiesSchema() {
                    return schema;
                }

                handler(req) {

                    return body;
                }
            };

            const passing = new Promise((resolve, reject) => {

                const endpoint = new TestEndpoint();

                const middleware = endpoint.createMiddleware(definitions);
                const req = httpMocks.createRequest({
                    query: passingParams,
                    body: passingParams,
                    params: passingParams,
                    headers: passingParams,
                    cookies: passingParams,
                    signedCookies: passingParams
                });
                const res = httpMocks.createResponse({
                    eventEmitter: EventEmitter
                });
                res.on('end', () => {

                    expect(res._getData()).to.equal(body);
                    expect(res._getHeaders()).to.deep.equal(Response.defaultHeaders());
                    expect(res._getStatusCode()).to.equal(Response.defaultStatusCode());
                    resolve();
                });
                const next = (err) => {

                    if (err) {
                        return reject(err);
                    }

                    reject(new Error('This should not be called.'));
                };

                middleware(req, res, next);
            });

            const failing = Promise.all(failingParams.map(params => {

                return new Promise((resolve, reject) => {

                    const endpoint = new TestEndpoint();
                    const middleware = endpoint.createMiddleware(definitions);
                    const req = httpMocks.createRequest({
                        query: params,
                        body: params,
                        params: params,
                        headers: params,
                        cookies: params,
                        signedCookies: params
                    });
                    const res = httpMocks.createResponse({
                        eventEmitter: EventEmitter
                    });
                    res.on('end', () => {
                        reject(new Error('This should not be called.'));
                    });
                    const next = (err) => {

                        expect(err).to.be.instanceOf(ValidationError);
                        resolve();
                    };

                    middleware(req, res, next);
                });

            }));

            Promise.all([ passing, failing ])
                .then(() => done())
                .catch(done);
        });

        it('can optionally validate responses', function(done) {

            const body = 'hi';
            const passingBody = {
                a: 'bar',
                b: 2,
                c: 'foo'
            };
            const failingBodies = [
                {},
                {
                    a: {},
                    b: 2,
                    c: 'foo'
                },
                {
                    a: 'bar',
                    b: 6,
                    c: 'foo'
                },
                {
                    a: 'bar',
                    b: 2,
                    c: 'baz'
                }
            ];

            const definitions = {
                foo: {
                    bar: Endpoint.objectSchema({
                        a: {
                            type: 'string'
                        },
                        b: {
                            type: 'integer',
                            maximum: 5
                        },
                        c: {
                            type: 'string',
                            const: 'foo'
                        }
                    })
                }
            };

            const schema = Endpoint.openApiReference('#/foo/bar');

            const BaseEndpoint = (class extends Endpoint {

                responseCodeSchemas() {

                    return {
                        '200': schema
                    };
                }

            }).withDefaultOptions({ validateResponse: true });

            const passing = new Promise((resolve, reject) => {

                const TestEndpoint = class extends BaseEndpoint {

                    handler(req) {

                        return passingBody;
                    }
                };

                const endpoint = new TestEndpoint();

                const middleware = endpoint.createMiddleware(definitions);
                const req = httpMocks.createRequest();
                const res = httpMocks.createResponse({
                    eventEmitter: EventEmitter
                });
                res.on('end', () => {

                    expect(res._getData()).to.deep.equal(passingBody);
                    expect(res._getHeaders()).to.deep.equal(Response.defaultHeaders());
                    expect(res._getStatusCode()).to.equal(Response.defaultStatusCode());
                    resolve();
                });
                const next = (err) => {

                    if (err) {
                        return reject(err);
                    }

                    reject(new Error('This should not be called.'));
                };

                middleware(req, res, next);
            });

            const failing = Promise.all(failingBodies.map(failingBody => {

                return new Promise((resolve, reject) => {

                    const TestEndpoint = class extends BaseEndpoint {

                        handler(req) {

                            return failingBody;
                        }
                    };

                    const endpoint = new TestEndpoint();
                    const middleware = endpoint.createMiddleware(definitions);
                    const req = httpMocks.createRequest();
                    const res = httpMocks.createResponse({
                        eventEmitter: EventEmitter
                    });
                    res.on('end', () => {
                        reject(new Error('This should not be called.'));
                    });
                    const next = (err) => {

                        expect(err).to.be.instanceOf(ValidationError);
                        expect(err.code).to.equal(500);
                        resolve();
                    };

                    middleware(req, res, next);
                });

            }));

            Promise.all([ passing, failing ])
                .then(() => done())
                .catch(done);


        });
    });

    describe('helpers', function() {

        describe('Endpoint.openApiReference(ref)', function() {

            it('creates a JSON reference object that references objects in the OpenAPI spec', function() {

                const ref = '#/foo/bar/baz';

                expect(OPEN_API_REFERENCE_ID).to.exist;
                expect(Endpoint.openApiReference(ref)).to.deep.equal({
                    $ref: `${OPEN_API_REFERENCE_ID}${ref}`
                });
            });
        });

        describe('Endpoint.objectSchema(properties = {}, required = null)', function() {

            it('creates schema object of type "object", with all properties required', function() {

                const properties = {
                    foo: {
                        type: 'string'
                    },
                    bar: {
                        type: 'integer'
                    }
                };

                expect(Endpoint.objectSchema(properties)).to.deep.equal({
                    type: 'object',
                    properties,
                    required: Object.keys(properties)
                });
            });

            it('can optionally override which properties are required by supplying an array of required properties', function() {

                const properties = {
                    foo: {
                        type: 'string'
                    },
                    bar: {
                        type: 'integer'
                    }
                };

                const required = ['foo'];

                expect(Endpoint.objectSchema(properties, required)).to.deep.equal({
                    type: 'object',
                    properties,
                    required
                });
            });
        });

        describe('Endpoint.defaultOptions()', function() {

            it('retrieves the default options', function() {

                expect(typeof Endpoint.defaultOptions()).to.equal('object');
            });
        });

        describe('Endpoint.withDefaultOptions(options = {})', function() {

            it('creates a subclass with the supplied options merged into its default options', function() {

                const MyEndpoint = Endpoint.withDefaultOptions({ validateResponse: true });

                expect(MyEndpoint.defaultOptions().validateResponse).to.equal(true);

            });
        });


        describe('Endpoint.withHandler(handler)', function() {

            it('creates a subclass with the supplied handler', function(done) {

                const request = {};
                const MyEndpoint = Endpoint.withHandler((req) => {

                    expect(req).to.equal(request);
                    done();
                });
                const endpoint = new MyEndpoint();
                endpoint.handler(request);
            });
        });
    });

});