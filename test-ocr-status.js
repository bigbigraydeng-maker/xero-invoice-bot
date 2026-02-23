const ocr = require('./ocr-unified');

console.log('OCR Status:', ocr.getOCRStatus());
console.log('Environment Variables:');
console.log('- GOOGLE_VISION_API_KEY:', process.env.GOOGLE_VISION_API_KEY ? 'Set (length: ' + process.env.GOOGLE_VISION_API_KEY.length + ')' : 'Not set');
console.log('- BAIDU_OCR_API_KEY:', process.env.BAIDU_OCR_API_KEY ? 'Set' : 'Not set');
console.log('- BAIDU_OCR_SECRET_KEY:', process.env.BAIDU_OCR_SECRET_KEY ? 'Set' : 'Not set');
