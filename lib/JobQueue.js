const DB = require('../src/DB');
const FF = require('./FF');
const util = require('./util');

class JobQueue {
	constructor() {
		this.jobs = [];
		this.currentJob = null;

		// Loop & find processing true items & enqueue them

		DB.update();
		DB.videos.forEach((vid) => {
			Object.keys(vid.resizes).forEach((key) => {
				if (vid.resizes[key].processing) {
					const [width, height] = key.split('x');
					console.log(key);
					this.enqueue({
						type: 'resize',
						videoId: vid.videoId,
						width,
						height,
					});
				}
			});
		});
	}

	async enqueue(job) {
		this.jobs.push(job);
		await this.executeNext();
	}

	dequeue() {
		return this.jobs.shift();
	}

	async executeNext() {
		if (this.currentJob) return;
		this.currentJob = this.dequeue();
		if (!this.currentJob) return;
		await this.execute(this.currentJob);
		// dequeue
	}

	async execute(job) {
		if (job.type === 'resize') {
			const { videoId, width, height } = job;
			DB.update();
			const video = DB.videos.find((video) => video.videoId === job.videoId);
			const originalVideoPath = `./storage/${videoId}/original.${video.extension}`;
			const targetVideoPath = `./storage/${videoId}/${width}x${height}.${video.extension}`;
			try {
				await FF.resize(originalVideoPath, targetVideoPath, width, height);
				console.log(['DONE RESIZing']);

				DB.update();
				const video = DB.videos.find((video) => video.videoId === job.videoId);
				video.resizes[`${width}x${height}`].processing = false;

				DB.save();
				console.log(`Done! Jobs remaining ${this.jobs.length}`);
			} catch (e) {
				util.deleteFile(targetVideoPath);
				console.log(e);
			}
		}
		this.currentJob = null;
		this.executeNext();
	}
}

module.exports = JobQueue;
