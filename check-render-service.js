/**
 * 检查 Render 服务配置
 */

const axios = require('axios');

const RENDER_API_KEY = 'rnd_c6H4rFOyP91xZn1C5WgFxZQUFxzS';
const SERVICE_ID = 'srv-d6c8l3npm1nc73cd12mg';

async function checkRenderService() {
    console.log('🔍 检查 Render 服务配置\n');
    console.log('=' .repeat(60));
    
    try {
        const response = await axios.get(
            `https://api.render.com/v1/services/${SERVICE_ID}`,
            {
                headers: {
                    'Authorization': `Bearer ${RENDER_API_KEY}`,
                    'Accept': 'application/json'
                }
            }
        );
        
        const service = response.data;
        console.log('服务信息:\n');
        console.log('  名称:', service.name);
        console.log('  类型:', service.type);
        console.log('  状态:', service.status);
        console.log('  仓库:', service.repo);
        console.log('  分支:', service.branch);
        console.log('  构建命令:', service.buildCommand);
        console.log('  启动命令:', service.startCommand);
        
        if (service.lastDeploy) {
            console.log('\n  上次部署:');
            console.log('    时间:', service.lastDeploy.createdAt);
            console.log('    状态:', service.lastDeploy.status);
            console.log('    Commit:', service.lastDeploy.commit?.message);
        }
        
    } catch (error) {
        console.error('❌ 检查失败:', error.message);
        if (error.response) {
            console.error('状态码:', error.response.status);
            console.error('错误:', error.response.data);
        }
    }
    
    console.log('\n' + '='.repeat(60));
}

checkRenderService();
