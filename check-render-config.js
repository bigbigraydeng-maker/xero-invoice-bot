/**
 * 检查 Render 环境变量配置是否正确
 */

const axios = require('axios');

const RENDER_API_KEY = 'rnd_c6H4rFOyP91xZn1C5WgFxZQUFxzS';
const SERVICE_ID = 'srv-d6c8l3npm1nc73cd12mg';

async function checkRenderConfig() {
    console.log('🔍 检查 Render 环境变量配置\n');
    console.log('=' .repeat(60));
    
    try {
        const response = await axios.get(
            `https://api.render.com/v1/services/${SERVICE_ID}/env-vars`,
            {
                headers: {
                    'Authorization': `Bearer ${RENDER_API_KEY}`,
                    'Accept': 'application/json'
                }
            }
        );
        
        const envVars = response.data;
        console.log(`找到 ${envVars.length} 个环境变量:\n`);
        
        // 检查关键变量
        const xeroRedirect = envVars.find(e => e.key === 'XERO_REDIRECT_URI');
        const xeroClientId = envVars.find(e => e.key === 'XERO_CLIENT_ID');
        const xeroSecret = envVars.find(e => e.key === 'XERO_CLIENT_SECRET');
        
        console.log('📋 Xero 配置检查:');
        console.log('');
        
        if (xeroRedirect) {
            console.log('XERO_REDIRECT_URI:', xeroRedirect.value);
            const isRenderUrl = xeroRedirect.value.includes('onrender.com');
            const isNgrokUrl = xeroRedirect.value.includes('ngrok');
            
            if (isRenderUrl) {
                console.log('  ✅ 正确（Render 地址）');
            } else if (isNgrokUrl) {
                console.log('  ⚠️  错误（使用了 ngrok 本地地址）');
                console.log('  建议更新为: https://xero-invoice-bot.onrender.com/xero/callback');
            }
        } else {
            console.log('XERO_REDIRECT_URI: ❌ 未设置');
        }
        
        console.log('');
        console.log('XERO_CLIENT_ID:', xeroClientId ? '✅ 已设置' : '❌ 未设置');
        console.log('XERO_CLIENT_SECRET:', xeroSecret ? '✅ 已设置' : '❌ 未设置');
        
        // 显示所有变量（隐藏敏感信息）
        console.log('\n📋 所有环境变量:');
        envVars.forEach(env => {
            const isSensitive = env.key.includes('SECRET') || env.key.includes('KEY') || env.key.includes('PASSWORD');
            const displayValue = isSensitive ? '***' : env.value;
            console.log(`  ${env.key}=${displayValue}`);
        });
        
    } catch (error) {
        console.error('❌ 检查失败:', error.message);
    }
    
    console.log('\n' + '='.repeat(60));
}

checkRenderConfig();
