/**
 * 自动配置 Render 环境变量和 Disk
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
    console.log('🚀 开始配置 Render 服务\n');
    console.log('=' .repeat(60));
    
    try {
        // 1. 设置环境变量
        console.log('\n📋 步骤 1: 设置环境变量');
        console.log('-'.repeat(60));
        
        for (const env of ENV_VARS) {
            try {
                await axios.post(
                    `https://api.render.com/v1/services/${SERVICE_ID}/env-vars`,
                    env,
                    {
                        headers: {
                            'Authorization': `Bearer ${RENDER_API_KEY}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    }
                );
                console.log(`  ✅ ${env.key}`);
            } catch (error) {
                if (error.response?.status === 409) {
                    // 已存在，更新它
                    try {
                        await axios.put(
                            `https://api.render.com/v1/services/${SERVICE_ID}/env-vars/${env.key}`,
                            env,
                            {
                                headers: {
                                    'Authorization': `Bearer ${RENDER_API_KEY}`,
                                    'Content-Type': 'application/json',
                                    'Accept': 'application/json'
                                }
                            }
                        );
                        console.log(`  🔄 ${env.key} (已更新)`);
                    } catch (updateError) {
                        console.log(`  ❌ ${env.key}: ${updateError.message}`);
                    }
                } else {
                    console.log(`  ❌ ${env.key}: ${error.message}`);
                }
            }
        }
        
        // 2. 创建 Disk
        console.log('\n📋 步骤 2: 创建 Disk');
        console.log('-'.repeat(60));
        
        try {
            await axios.post(
                `https://api.render.com/v1/services/${SERVICE_ID}/disks`,
                {
                    name: 'bizmate-data',
                    mountPath: '/data',
                    sizeGB: 1
                },
                {
                    headers: {
                        'Authorization': `Bearer ${RENDER_API_KEY}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );
            console.log('  ✅ Disk 创建成功: bizmate-data (/data, 1GB)');
        } catch (error) {
            if (error.response?.status === 409) {
                console.log('  🔄 Disk 已存在');
            } else {
                console.log(`  ❌ Disk 创建失败: ${error.message}`);
                if (error.response) {
                    console.log('     错误详情:', error.response.data);
                }
            }
        }
        
        // 3. 触发部署
        console.log('\n📋 步骤 3: 触发部署');
        console.log('-'.repeat(60));
        
        try {
            await axios.post(
                `https://api.render.com/v1/services/${SERVICE_ID}/deploys`,
                {
                    clearCache: 'do_not_clear'
                },
                {
                    headers: {
                        'Authorization': `Bearer ${RENDER_API_KEY}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );
            console.log('  ✅ 部署已触发');
            console.log('  ⏳ 请等待 2-3 分钟让服务启动');
        } catch (error) {
            console.log(`  ❌ 部署触发失败: ${error.message}`);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ 配置完成！');
        console.log('\n下一步:');
        console.log('1. 等待 2-3 分钟让服务启动');
        console.log('2. 访问: https://xero-invoice-bot.onrender.com/xero/health');
        console.log('3. 如果显示未授权，访问: https://xero-invoice-bot.onrender.com/xero/auth');
        console.log('4. 在飞书测试新功能');
        
    } catch (error) {
        console.error('\n❌ 配置失败:', error.message);
        if (error.response) {
            console.error('API 错误:', error.response.data);
        }
    }
}

setupRender();
