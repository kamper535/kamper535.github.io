const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const root = __dirname;

const mime = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.wav': 'audio/wav',
	'.mp3': 'audio/mpeg',
};

function safeJoin(base, target) {
	const targetPath = path.posix.normalize('/' + target).replace(/^(\.\.(\/|\\|$))+/, '');
	return path.join(base, targetPath);
}

const server = http.createServer((req, res) => {
	const urlPath = req.url.split('?')[0];
	let filePath = safeJoin(root, urlPath === '/' ? '/index.html' : urlPath);
	const ext = path.extname(filePath).toLowerCase();

	fs.stat(filePath, (err, stat) => {
		if (err) {
			res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
			res.end('Not found');
			return;
		}
		if (stat.isDirectory()) {
			filePath = path.join(filePath, 'index.html');
		}
		fs.readFile(filePath, (readErr, data) => {
			if (readErr) {
				res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
				res.end('Server error');
				return;
			}
			const type = mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
			res.writeHead(200, { 'Content-Type': type });
			res.end(data);
		});
	});
});

server.listen(port, () => {
	console.log(`Pigeon Shooter running at http://localhost:${port}`);
});


