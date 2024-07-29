const { spawn } = require('node:child_process');

const FF = {};

FF.makeThumbnail = async (videoPath, thumbnailPath) => {
	//  ffmpeg -i video.mov -ss 5 -vframes 1 thumbnail.jpg
	const promise = new Promise((resolve, reject) => {
		const ffmpegProcess = spawn('ffmpeg', [
			'-i',
			videoPath,
			'-ss',
			'00:00:05',
			'-vframes',
			'1',
			thumbnailPath,
		]);

		ffmpegProcess.on('close', (code) => {
			if (code !== 0) {
				reject(`ffmpeg exited with code ${code}`);
			} else {
				resolve();
			}
		});

		ffmpegProcess.on('error', (err) => {
			reject(err);
		});
	});

	return promise;
};

FF.getVideoDimensions = async (videoPath) => {
	const promise = new Promise((resolve, reject) => {
		const ffprobeProcess = spawn('ffprobe', [
			'-v',
			'error',
			'-select_streams',
			'v:0',
			'-show_entries',
			'stream=width,height',
			'-of',
			'json',
			videoPath,
		]);

		let data = '';
		ffprobeProcess.stdout.on('data', (chunk) => {
			data += chunk;
		});

		ffprobeProcess.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`ffprobe exited with code ${code}`));
			} else {
				resolve(JSON.parse(data).streams[0]);
			}
		});

		ffprobeProcess.on('error', (err) => {
			reject(err);
		});
	});

	return promise;
};

FF.extractAudio = async (filePath, targetPath) => {
	return new Promise((resolve, reject) => {
		const ffProcess = spawn('ffmpeg', [
			'-i',
			filePath,
			'-vn',
			'-c:a',
			'copy',
			targetPath,
		]);

		ffProcess.on('close', (code) => {
			if (code !== 0) {
				reject(`ffmpeg exited with code ${code}`);
			} else {
				resolve();
			}
		});
		ffProcess.on('error', (err) => {
			reject(err);
		});
	});
};

FF.resize = async (filePath, targetPath, width, height) => {
	// ffmpeg -i  video.mov -vf scale=320:240 -c:a copy video-320x240.mov

	// node has nice value 1
	// ff has nice value 99
	// my OS will allocate more resources to node as it has highest priority
	// nice  -20 19, renice command
	// tasket command
	return new Promise((resolve, reject) => {
		const ffProcess = spawn('ffmpeg', [
			'-i',
			filePath,
			'-vf',
			`scale=${width}:${height}`,
			'-c:a',
			'copy',
			// 'threads',
			// '2', // limit cpus to the resize process
			'-y', // to answer to prompt for overide file
			targetPath,
		]);

		ffProcess.on('close', (code) => {
			if (code !== 0) {
				reject(`ffmpeg exited with code ${code}`);
			} else {
				resolve();
			}
		});
		ffProcess.on('error', (err) => {
			reject(err);
		});
	});
};

module.exports = FF;
