/**
 * 修复 Render 环境变量 - 设置 Xero 配置
 */

const axios = require('axios');

const RENDER_API_KEY = 'rnd_c6H4rFOyP91xZn1C5WgFxZQUFxzS';
const SERVICE_ID = 'srv-d6c8l3npm1nc73cd12mg';

// 需要设置的 Xero 环境变量
const XERO_ENV_VARS = [
    {
        key: 'XERO_CLIENT_ID',
        value: '5C698D67083C405A89C46D4E73755EDB'
    },
    {
        key: 'XERO_CLIENT_SECRET',
        value: '5G2DT19U_uiG_8sehwC9R4P4s6ixmjQxiJD-qbd3yvddlIO9'
    },
    {
        key: 'XERO_REDIRECT_URI',
        value: 'https://xero-invoice-bot.onrender.com/xero/callback'
    }
];

async function fixRenderEnv() {
    console.log('🔧 修复 Render 环境变量\n');
    console.log('=' .repeat(60));
    
    const headers = {
        'Authorization': `Bearer ${RENDER_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    
    try {
        // 1. 获取现有环境变量
        console.log('\n📋 步骤 1: 获取现有环境变量');
        let existingEnvVars = [];
        try {
            const response = await axios.get(
                `https://api.render.com/v1/services/${SERVICE_ID}/env-vars`,
                { headers }
            );
            existingEnvVars = response.data || [];
            console.log(`  现有环境变量: ${existingEnvVars.length} 个`);
        } catch (error) {
            console.log('  无法获取现有环境变量:', error.message);
        }
        
        // 2. 设置 Xero 环境变量
        console.log('\n📋 步骤 2: 设置 Xero 环境变量');
        console.log('-'.repeat(60));
        
        for (const env of XERO_ENV_VARS) {
            const exists = existingEnvVars.find(e => e.key === env.key);
            
            try {
                if (exists) {
                    // 更新现有变量
                    console.log(`  更新 ${env.key}...`);
                    await axios.put(
                        `https://api.render.com/v1/services/${SERVICE_ID}/env-vars/${env.key}`,
                        env,
                        { headers }
                    );
                    console.log(`  ✅ ${env.key} (已更新)`);
                } else {
                    // 创建新变量
                    console.log(`  创建 ${env.key}...`);
                    await axios.post(
                        `https://api.render.com/v1/services/${SERVICE_ID}/env-vars`,
                        env,
                        { headers }
                    );
                    console.log(`  ✅ ${env.key} (已创建)`);
                }
            } catch (error) {
                console.log(`  ❌ ${env.key}: ${error.message}`);
                if (error.response) {
                    console.log(`     状态码: ${error.response.status}`);
                    console.log(`     错误: ${JSON.stringify(error.response.data)}`);
                }
            }
        }
        
        // 3. 触发重新部署
        console.log('\n📋 步骤 3: 触发重新部署');
        console.log('-'.repeat(60));
        
        try {
            await axios.post(
                `https://api.render.com/v1/services/${SERVICE_ID}/deploys`,
                { clearCache: 'do_not_clear' },
                { headers }
            );
            console.log('  ✅ 部署已触发');
            console.log('  ⏳ 请等待 2-3 分钟让服务重启');
        } catch (error) {
            console.log(`  ❌ 部署触发失败: ${error.message}`);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ 修复完成！');
        console.log('\n下一步:');
        console.log('1. 等待 2-3 分钟让服务重启');
        console.log('2. 运行: node check-deploy-status.js');
        console.log('3. 在飞书测试新功能');
        
    } catch (error) {
        console.error('\n❌ 修复失败:', error.message);
    }
}

fixRenderEnv();
