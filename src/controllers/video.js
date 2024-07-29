const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { pipeline } = require('node:stream/promises');
const util = require('../../lib/util');
const DB = require('../DB');
const FF = require('../../lib/FF');
const cluster = require('node:cluster');

const JobQueue = require('../../lib/JobQueue');
let jobs;
if (cluster.isPrimary) {
	jobs = new JobQueue();
}

// Get all videos uploaded by the user
const getVideos = (req, res, handlErr) => {
	DB.update();
	const videos = DB.videos.filter((video) => video.userId === req.userId);
	res.status(200).json(videos);
};

// Upload a video
const uploadVideo = async (req, res, handlErr) => {
	const specifiedFileName = req.headers.filename;
	const extension = path.extname(specifiedFileName).substring(1).toLowerCase();
	const name = path.parse(specifiedFileName).name;
	const videoId = crypto.randomBytes(4).toString('hex');

	const SUPPORTED_EXTENSIONS = ['mp4', 'mov'];

	if (!SUPPORTED_EXTENSIONS.includes(extension)) {
		return handlErr({ status: 400, message: 'Unsupported file extension' });
	}

	try {
		await fs.mkdir(`./storage/${videoId}`);
		const fullPath = `./storage/${videoId}/original.${extension}`; // the original vide file
		const file = await fs.open(fullPath, 'w');
		const fileStream = file.createWriteStream();

		const thumbnailPath = `./storage/${videoId}/thumbnail.jpg`;
		// req.pipe(fileStream);
		await pipeline(req, fileStream);

		// Make a thumbnail for the video file
		await FF.makeThumbnail(fullPath, thumbnailPath);
		// Get the dimensions

		const dimensions = await FF.getVideoDimensions(fullPath);

		DB.update(); // put file objects in memory

		DB.videos.unshift({
			id: DB.videos.length,
			videoId,
			name,
			extension,
			userId: req.userId,
			extractedAudio: false,
			resizes: {},
			dimensions,
		});

		DB.save();

		res.status(201).json({
			status: 'success',
			videoId,
			message: 'Video uploaded successfully',
		});
	} catch (err) {
		// Delete the folder
		await util.deleteFolder(`./storage/${videoId}`);
		if (err.code !== 'ECONNRESET') {
			return handlErr(err);
		}
	}
};

const getVideoAsset = async (req, res, handlErr) => {
	const videoId = req.params.get('videoId');
	const type = req.params.get('type');
	DB.update();

	const video = DB.videos.find((video) => video.videoId === videoId);
	if (!video) {
		return handlErr({ status: 404, message: 'Video not found' });
	}

	let file;
	let mimeType;
	let fileName;
	switch (type) {
		case 'thumbnail':
			file = await fs.open(`./storage/${videoId}/thumbnail.jpg`, 'r');
			mimeType = 'image/jpeg';

			break;

		case 'audio':
			file = await fs.open(`./storage/${videoId}/audio.aac`, 'r');
			mimeType = 'audio/aac';
			fileName = `${video.name}-audio.aac`;
			break;

		case 'resize':
			const dimensions = req.params.get('dimensions');
			console.log(dimensions);
			file = await fs.open(
				`./storage/${videoId}/${dimensions}.${video.extension}`,
				'r'
			);
			mimeType = 'video/mp4';
			fileName = `${video.name}-${dimensions}.${video.extension}`;
			break;

		case 'original':
			file = await fs.open(
				`./storage/${videoId}/original.${video.extension}`,
				'r'
			);
			mimeType = `video/mp4`; // Get the mime type using a separate function
			fileName = `${video.name}.${video.extension}`;
			break;

		// audio
	}

	try {
		const stat = await file.stat();
		const fileStream = file.createReadStream();
		res.setHeader('Content-Type', mimeType);
		res.setHeader('Content-Length', stat.size);

		if (type !== 'thumbnail') {
			res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
		}
		res.status(200);
		await pipeline(fileStream, res);
		await file.close();
	} catch (err) {}
};

// extract audio for video file
const extractAudio = async (req, res, handlErr) => {
	const videoId = req.params.get('videoId');

	DB.update();

	const video = DB.videos.find((video) => video.videoId === videoId);
	if (!video) {
		return handlErr({ status: 404, message: 'Video not found' });
	}

	if (video.extractedAudio) {
		return handlErr({
			status: 400,
			message: 'Audio already extracted ',
		});
	}

	try {
		const originalVideoPath = `./storage/${videoId}/original.${video.extension}`;
		const targetAudioPath = `./storage/${videoId}/audio.aac`;
		await FF.extractAudio(originalVideoPath, targetAudioPath);
		video.extractedAudio = true;
		DB.save();
		res.status(200).json({
			statu: 'success',
			message: 'Audio extacted successfully',
		});
	} catch (err) {
		return this.handlErr(err);
	}
};

const resizeVideo = async (req, res, handleErr) => {
	const videoId = req.body.videoId;
	const width = +req.body.width;
	const height = +req.body.height;

	DB.update();

	const video = DB.videos.find((video) => video.videoId === videoId);
	if (!video) {
		return handleErr({ status: 404, message: 'Video not found' });
	}

	// const originalVideoPath = `./storage/${videoId}/original.${video.extension}`;
	// const targetVideoPath = `./storage/${videoId}/${width}x${height}.${video.extension}`;
	video.resizes[`${width}x${height}`] = { processing: true };
	DB.save();

	try {
		// this ensures that application is run in both cluster & normal mode
		// run without nodemon as nodemon acts as the parent process of node index.js
		if (cluster.isPrimary) {
			jobs.enqueue({
				type: 'resize',
				videoId,
				width,
				height,
			});
		} else {
			process.send({
				messageType: 'new-resize',
				data: { videoId, width, height },
			});
		}
		// jobs.enqueue({
		// 	type: 'resize',
		// 	videoId,
		// 	width,
		// 	height,
		// });
		// await FF.resize(originalVideoPath, targetVideoPath, width, height);
		// console.log(['DONE RESIZing']);

		// video.resizes[`${width}x${height}`].processing = false;

		// DB.save();
		res.status(200).json({
			status: 'success',
			message: 'The video is now being processed',
		});
	} catch (err) {
		// util.deleteFile(targetVideoPath);
		return handleErr(err);
	}
};

const controller = {
	getVideos,
	uploadVideo,
	getVideoAsset,
	extractAudio,
	resizeVideo,
};

module.exports = controller;
