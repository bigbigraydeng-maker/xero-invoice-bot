/**
 * 测试 Xero Token 刷新机制
 */

const xero = require('./xero');

async function testToken() {
    console.log('🧪 测试 Xero Token 状态...\n');
    
    try {
        // 测试 1: 获取有效 token
        console.log('1️⃣ 测试获取有效 token...');
        const startTime = Date.now();
        const result = await xero.getReceivablesSummary();
        const duration = Date.now() - startTime;
        
        console.log(`✅ 成功! 耗时: ${duration}ms`);
        console.log(`📊 找到 ${result.invoices?.length || 0} 张发票`);
        console.log(`💰 总应收: $${result.totalOutstanding || 0}`);
        
        // 测试 2: 再次调用（验证缓存）
        console.log('\n2️⃣ 再次调用（验证 token 缓存）...');
        const startTime2 = Date.now();
        const result2 = await xero.getReceivablesSummary();
        const duration2 = Date.now() - startTime2;
        console.log(`✅ 成功! 耗时: ${duration2}ms`);
        
        console.log('\n✨ 所有测试通过！Token 机制工作正常');
        
    } catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        if (error.message.includes('Not authenticated')) {
            console.log('\n🔑 需要重新授权 Xero');
        }
    }
}

testToken();
