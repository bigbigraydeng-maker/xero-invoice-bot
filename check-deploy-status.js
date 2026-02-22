/**
 * 检查 Render 部署状态
 */

const axios = require('axios');

const SERVICE_URL = 'https://xero-invoice-bot.onrender.com';

async function checkStatus() {
    console.log('🔍 检查部署状态\n');
    console.log('=' .repeat(60));
    
    // 检查健康状态
    console.log('\n📋 检查服务健康状态');
    try {
        const healthResponse = await axios.get(`${SERVICE_URL}/health`, {
            timeout: 10000
        });
        console.log('✅ 服务运行正常');
        console.log('  状态:', JSON.stringify(healthResponse.data, null, 2));
    } catch (error) {
        console.log('❌ 服务未响应:', error.message);
        console.log('  可能正在部署中，请稍后再试');
    }
    
    // 检查 Xero 认证状态
    console.log('\n📋 检查 Xero 认证状态');
    try {
        const xeroResponse = await axios.get(`${SERVICE_URL}/xero/health`, {
            timeout: 10000
        });
        console.log('✅ Xero 状态:', xeroResponse.data.status);
        if (xeroResponse.data.status === 'authenticated') {
            console.log('  Tenant ID:', xeroResponse.data.tenant_id);
        } else {
            console.log('  ⚠️ 需要重新授权');
            console.log('  访问:', `${SERVICE_URL}/xero/auth`);
        }
    } catch (error) {
        console.log('❌ 无法检查 Xero 状态:', error.message);
    }
    
    console.log('\n' + '='.repeat(60));
}

checkStatus();
