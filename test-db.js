const db = require('./db');

async function test() {
    try {
        console.log('Testing database functions...');
        
        // Test getHistory
        const history = await db.getHistory('test-user', 20);
        console.log('getHistory result:', history);
        console.log('Type:', typeof history);
        console.log('Is Array:', Array.isArray(history));
        
        // Test saveMessage
        await db.saveMessage('test-user', 'user', 'Hello');
        console.log('saveMessage success');
        
        // Test getHistory again
        const history2 = await db.getHistory('test-user', 20);
        console.log('getHistory after save:', history2);
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        db.closeDatabase();
    }
}

test();
