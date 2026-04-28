const fs = require('fs');
const file = '/Users/aryankrishan/Documents/Playground/famlo-web/components/partners/tabs/DashboardTab.tsx';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

// 1300 to 1595 (1-indexed => 1299 to 1595 0-indexed slice)
// But to be safer, I should just find the exact slice.
// In the current file, line 1300 is:         <div style={{ display: 'grid', gap: '20px', minWidth: 0 }}>
// line 1595 is:         </div>

const sourceBlock = lines.slice(1299, 1595).join('\n');
const targetContent = lines.slice(748, 921).join('\n');

const newContent = content.replace(targetContent, sourceBlock);
fs.writeFileSync(file, newContent, 'utf8');
console.log('Replaced lines successfully');
