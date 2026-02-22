/**
 * 检查 Render 环境变量配置
 */

const axios = require('axios');

const RENDER_API_KEY = 'rnd_c6H4rFOyP91xZn1C5WgFxZQUFxzS';
const SERVICE_ID = 'srv-d6c8l3npm1nc73cd12mg';

async function checkRenderEnv() {
    console.log('🔍 检查 Render 环境变量配置\n');
    console.log('=' .repeat(60));
    
    try {
        // 获取服务信息
        const serviceResponse = await axios.get(
            `https://api.render.com/v1/services/${SERVICE_ID}`,
            {
                headers: {
                    'Authorization': `Bearer ${RENDER_API_KEY}`,
                    'Accept': 'application/json'
                }
            }
        );
        
        const service = serviceResponse.data;
        console.log('\n📋 服务信息:');
        console.log('  名称:', service.name);
        console.log('  状态:', service.status);
        console.log('  URL:', service.url);
        
        // 获取环境变量
        const envResponse = await axios.get(
            `https://api.render.com/v1/services/${SERVICE_ID}/env-vars`,
            {
                headers: {
                    'Authorization': `Bearer ${RENDER_API_KEY}`,
                    'Accept': 'application/json'
                }
            }
        );
        
        const envVars = envResponse.data;
        console.log('\n📋 环境变量:');
        
        const requiredVars = [
            'FEISHU_APP_ID',
            'FEISHU_APP_SECRET',
            'MOONSHOT_API_KEY',
            'XERO_CLIENT_ID',
            'XERO_CLIENT_SECRET',
            'XERO_REDIRECT_URI',
            'RENDER_DISK_PATH'
        ];
        
        const envMap = {};
        envVars.forEach(env => {
            envMap[env.key] = env.value;
        });
        
        requiredVars.forEach(varName => {
            const isSet = envMap[varName];
            const displayValue = isSet 
                ? (varName.includes('SECRET') || varName.includes('KEY') 
                    ? '✅ 已设置 (隐藏)' 
                    : `✅ ${isSet}`)
                : '❌ 未设置';
            console.log(`  ${varName}: ${displayValue}`);
        });
        
        // 检查缺失的变量
        const missing = requiredVars.filter(v => !envMap[v]);
        if (missing.length > 0) {
            console.log('\n⚠️ 缺失的环境变量:');
            missing.forEach(v => console.log(`  - ${v}`));
        } else {
            console.log('\n✅ 所有必需环境变量已设置');
        }
        
        // 检查 Disk
        console.log('\n📋 Disk 配置:');
        if (service.disk) {
            console.log('  名称:', service.disk.name);
            console.log('  挂载路径:', service.disk.mountPath);
            console.log('  大小:', service.disk.sizeGB, 'GB');
        } else {
            console.log('  ❌ 未配置 Disk');
        }
        
    } catch (error) {
        console.error('❌ 检查失败:', error.message);
        if (error.response) {
            console.error('API 错误:', error.response.data);
        }
    }
    
    console.log('\n' + '='.repeat(60));
}

checkRenderEnv();
