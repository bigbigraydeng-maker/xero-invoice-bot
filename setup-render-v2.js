/**
 * 自动配置 Render 环境变量和 Disk - V2
 * 使用正确的 API 端点
 */

const axios = require('axios');

const RENDER_API_KEY = 'rnd_c6H4rFOyP91xZn1C5WgFxZQUFxzS';
const SERVICE_ID = 'srv-d6c8l3npm1nc73cd12mg';

// 环境变量配置
const ENV_VARS = [
    { key: 'FEISHU_APP_ID', value: 'cli_a9139fddafb89bb5' },
    { key: 'FEISHU_APP_SECRET', value: 'BaChzUHA3iAPfddnIJ4T1eqvPqCMySPR' },
    { key: 'MOONSHOT_API_KEY', value: 'sk-9ELqQcQuflGPjhVZYt8mAiQPf6KXvjjO2wdmzcTTyBdsEFp1' },
    { key: 'XERO_CLIENT_ID', value: '5C698D67083C405A89C46D4E73755EDB' },
    { key: 'XERO_CLIENT_SECRET', value: '5G2DT19U_uiG_8sehwC9R4P4s6ixmjQxiJD-qbd3yvddlIO9' },
    { key: 'XERO_REDIRECT_URI', value: 'https://xero-invoice-bot.onrender.com/xero/callback' },
    { key: 'PORT', value: '10000' },
    { key: 'RENDER_DISK_PATH', value: '/data' }
];

async function setupRender() {
    console.log('🚀 开始配置 Render 服务 (V2)\n');
    console.log('=' .repeat(60));
    
    const headers = {
        'Authorization': `Bearer ${RENDER_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    
    try {
        // 1. 先获取现有环境变量
        console.log('\n📋 步骤 1: 检查现有环境变量');
        console.log('-'.repeat(60));
        
        let existingEnvVars = [];
        try {
            const envResponse = await axios.get(
                `https://api.render.com/v1/services/${SERVICE_ID}/env-vars`,
                { headers }
            );
            existingEnvVars = envResponse.data || [];
            console.log(`  现有环境变量: ${existingEnvVars.length} 个`);
        } catch (error) {
            console.log('  无法获取现有环境变量:', error.message);
        }
        
        // 2. 设置环境变量（逐个更新）
        console.log('\n📋 步骤 2: 设置环境变量');
        console.log('-'.repeat(60));
        
        for (const env of ENV_VARS) {
            const exists = existingEnvVars.find(e => e.key === env.key);
            
            try {
                if (exists) {
                    // 更新现有变量
                    await axios.put(
                        `https://api.render.com/v1/services/${SERVICE_ID}/env-vars/${env.key}`,
                        env,
                        { headers }
                    );
                    console.log(`  🔄 ${env.key} (已更新)`);
                } else {
                    // 创建新变量
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
                    console.log(`     状态: ${error.response.status}`);
                }
            }
        }
        
        // 3. 检查/创建 Disk
        console.log('\n📋 步骤 3: 检查 Disk');
        console.log('-'.repeat(60));
        
        try {
            const diskResponse = await axios.get(
                `https://api.render.com/v1/services/${SERVICE_ID}/disks`,
                { headers }
            );
            const disks = diskResponse.data || [];
            console.log(`  现有 Disks: ${disks.length} 个`);
            
            const hasDataDisk = disks.find(d => d.name === 'bizmate-data');
            if (hasDataDisk) {
                console.log('  🔄 Disk "bizmate-data" 已存在');
            } else {
                console.log('  ⚠️ 需要手动在 Dashboard 创建 Disk');
                console.log('     Name: bizmate-data');
                console.log('     Mount Path: /data');
                console.log('     Size: 1 GB');
            }
        } catch (error) {
            console.log('  无法获取 Disk 信息:', error.message);
        }
        
        // 4. 触发部署
        console.log('\n📋 步骤 4: 触发部署');
        console.log('-'.repeat(60));
        
        try {
            await axios.post(
                `https://api.render.com/v1/services/${SERVICE_ID}/deploys`,
                { clearCache: 'do_not_clear' },
                { headers }
            );
            console.log('  ✅ 部署已触发');
        } catch (error) {
            console.log(`  ❌ 部署触发失败: ${error.message}`);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ 配置完成！');
        console.log('\n⚠️ 重要提示:');
        console.log('如果环境变量设置失败，请手动在 Render Dashboard 配置:');
        console.log('https://dashboard.render.com/web/srv-d6c8l3npm1nc73cd12mg');
        console.log('\n需要设置的环境变量:');
        ENV_VARS.forEach(env => {
            console.log(`  ${env.key}=${env.value.substring(0, 20)}...`);
        });
        
    } catch (error) {
        console.error('\n❌ 配置失败:', error.message);
    }
}

setupRender();
