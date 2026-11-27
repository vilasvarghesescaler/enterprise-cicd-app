describe('Basic Application Tests', () => {

    test('Addition should return the correct result', () => {
        expect(2 + 3).toBe(5);
    });

    test('Application environment should be defined', () => {
        expect(process.env.NODE_ENV).toBeDefined();
    });

    test('Object should contain the expected status', () => {
        const response = {
            status: 'healthy'
        };

        expect(response.status).toBe('healthy');
    });

});
