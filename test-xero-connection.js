/**
 * 测试 Xero 连接
 */

const axios = require('axios');

const SERVICE_URL = 'https://xero-invoice-bot.onrender.com';

async function testXeroConnection() {
    console.log('🔍 测试 Xero 连接\n');
    console.log('=' .repeat(60));
    
    // 1. 检查健康状态
    console.log('\n1️⃣ 检查服务健康状态');
    try {
        const healthResponse = await axios.get(`${SERVICE_URL}/health`, {
            timeout: 10000
        });
        console.log('✅ 服务运行正常');
        console.log('  Xero 状态:', healthResponse.data.xero);
    } catch (error) {
        console.log('❌ 服务未响应:', error.message);
        return;
    }
    
    // 2. 测试 BAS 报告 API
    console.log('\n2️⃣ 测试 BAS 报告 API');
    try {
        // 注意：这个端点可能不存在，只是测试连接
        const response = await axios.get(`${SERVICE_URL}/xero/test-bas`, {
            timeout: 10000
        });
        console.log('✅ BAS API 响应:', response.data);
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log('ℹ️  测试端点不存在（正常）');
        } else {
            console.log('❌ BAS API 错误:', error.message);
        }
    }
    
    // 3. 检查环境变量（通过 health 端点）
    console.log('\n3️⃣ 检查环境变量配置');
    console.log('  注意：XERO_REDIRECT_URI 应该设置为:');
    console.log('  https://xero-invoice-bot.onrender.com/xero/callback');
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 诊断建议:');
    console.log('1. 如果 Xero 状态显示 "not_authenticated"，需要重新授权');
    console.log('2. 访问:', `${SERVICE_URL}/xero/auth`);
    console.log('3. 授权完成后，token 会保存到 /data/tokens.json');
    console.log('4. 如果仍然失败，请检查 Render Dashboard 日志');
}

testXeroConnection();
