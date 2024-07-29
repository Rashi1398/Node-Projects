const cluster = require('node:cluster');
const JobQueue = require('../lib/JobQueue');

// spawm -> fork -> cluster.fork() 

if (cluster.isPrimary) {
	const jobs = new JobQueue();
	const coreCount = require('node:os').availableParallelism();

	for (let i = 0; i < coreCount; i++) {
		cluster.fork();
	}

	cluster.on('message', (worker, message) => {
		if (message.messageType === 'new-resize') {
			const { videoId, width, height } = message.data;
			console.log(message.data);
			jobs.enqueue({
				type: 'resize',
				videoId,
				width,
				height,
			});
		}
	});

	cluster.on('exit', (worker, code, signal) => {
		console.log(
			`Worker ${worker.process.pid} died (${signal} | ${code}). Restarting`
		);
		cluster.fork();
	});
} else {
	require('./index');
}
