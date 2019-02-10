/*jshint esversion: 6 */

//Modules
const cheerio = require('cheerio');
require('colors');
const csvdata = require('csvdata');
const fs = require('fs');
const jsonfile = require('jsonfile');
// const readline = require('readline');
const rp = require('request-promise');

//-------------

//Initialize variables\

let datetime = new Date();
datetime = `${datetime.getFullYear()}-${(datetime.getMonth()+1)}-${datetime.getDate()}`;


const targets = [
	{
		name: 'Datasets',
		url: 'https://www.kaggle.com/datasets?sortBy=votes&group=public&page=1&pageSize=20&size=all&filetype=all&license=all'
	},
	{
		name: 'Competitions',
		url: 'https://www.kaggle.com/competitions?sortBy=numberOfTeams&group=general&page=1&pageSize=20'
	},
	{
		name: 'User: Competition',
		url: 'https://www.kaggle.com/rankings?group=competitions&page=1&pageSize=20'
	}
];

let rpOptions = {
	transform: function (body) {
		return cheerio.load(body);
	}
};

//----------------------------
//Initical Setup


initScrapper();

//----------------------------//
//initiate

//delay load pages to scrapper
function sleeper(ms) {
	return function (x) {
		return new Promise(resolve => setTimeout(() => resolve(x), ms));
	};
}

// initScrapper();
function initScrapper() {
	console.log('Scraper for Kaggle'.green);
	console.log('-----------------');
	console.log('Initializing scrapping.');

	for (const target of targets) {
		console.log(`Top ${target.name} | URL: ${target.url}`);
		loadURL(target);
	}

}

function loadURL(target) {
	rpOptions.uri = target.url;

	//loadd promise
	rp(rpOptions)
		.then(sleeper(100))
		.then(($) => {

			if (target.name == 'Datasets') {
				scrapeTopDatasets($);
			} else if (target.name == 'Competitions') {
				scrapeTopChallenges($);
			} else if (target.name == 'User: Competition') {
				scrapeTopUser($);
			}
		})
		.catch((err) => {
			console.log(err);
		});

}

function scrapeTopDatasets($) {
	
	const script = $('.site-layout__main-content').find('script');
	const data = script.html();

	//isolate data
	const isolatedData = data.substring(77,data.length-93);
	const jsonData = JSON.parse(isolatedData);
	const list = jsonData.datasetListItems;

	console.log('-----------------'.blue);
	console.log('TOP DATASETS'.blue);

	const topDatasets = {
		title: 'Kaggle-Top-Datasets',
		dataset:[],
		headers: 'title,downloads,views,votes,url'
	};
	
	for (const item of list) {
		topDatasets.dataset.push(extractDatasetInfo(item));
	}

	getJson(topDatasets);
	getCSV(topDatasets);

}

function extractDatasetInfo(item) {

	// console.log(item);

	const Dataset = {
		title: item.title,
		downloads: item.downloadCount,
		views: item.viewCount,
		votes: item.voteButton.totalVotes,
		url: 'https://www.kaggle.com' + item.datasetUrl
	};

	return Dataset;
}


function scrapeTopChallenges($) {

	const script = $('.site-layout__main-content').find('script');
	const data = script.html();

	// //isolate data
	const isolatedData = data.substring(77,data.length-101);
	const jsonData = JSON.parse(isolatedData);
	const list = jsonData.pagedCompetitionGroup.competitions;

	console.log('-----------------'.blue);
	console.log('TOP COMPETITIONS'.blue);

	const topCompetition = {
		title: 'Kaggle-Top-Challenges',
		dataset:[],
		headers: 'title,organization,teams,url'
	};
	
	for (const item of list) {
		topCompetition.dataset.push(extractChallengeInfo(item));
	}

	getJson(topCompetition);
	getCSV(topCompetition);

}

function extractChallengeInfo(item) {

	// console.log(item);

	const competition = {
		title: item.competitionTitle,
		organization: item.organizationName,
		teams: item.totalTeams,
		url: 'https://www.kaggle.com' + item.competitionUrl
	};

	return competition;
}

function scrapeTopUser($) {

	const script = $('.site-layout__main-content').find('script');
	const data = script.html();

	// //isolate data
	const isolatedData = data.substring(77,data.length-94);
	const jsonData = JSON.parse(isolatedData);
	const list = jsonData.list;

	console.log('-----------------'.blue);
	console.log('TOP USERS'.blue);

	const topUsers = {
		title: 'Kaggle-Top-Users-Competition',
		dataset:[],
		headers: 'name,ranking,tier,goldMedals,silverMedals,bronzeMedals,url'
	};
	
	for (const item of list) {
		topUsers.dataset.push(extractUserInfo(item));
	}

	getJson(topUsers);
	getCSV(topUsers);

}	

function extractUserInfo(item) {

	// console.log(item);

	const user = {
		name: item.displayName,
		ranking: item.currentRanking,
		tier: item.tier,
		goldMedals: item.totalGoldMedals,
		silverMedals: item.totalSilverMedals,
		bronzeMedals: item.totalBronzeMedals,
		url: 'https://www.kaggle.com' + item.userUrl
	};

	return user;
}

//get JSON
function getJson(target) {

	const fileName = `${target.title}-${datetime}.json`;
	const folder = './results';

	console.log(`Writing data to ${folder}/${fileName}`);

	if (!fs.existsSync(folder)) fs.mkdirSync(folder);

	jsonfile.writeFile(`${folder}/${fileName}`, target.dataset, {
		spaces: 4
	}, function (err) {
		if (err) {
			console.log(err);
		} else {
			console.log('Json: Data written!'.green);

			console.log('-----------------');
		}
	});

}

//get CSV
function getCSV(target) {

	const fileName = `${target.title}-${datetime}.csv`;
	const folder = './results';

	if (!fs.existsSync(folder)) fs.mkdirSync(folder);

	//header
	// const header = target.headers;
	// csvdata.write(`${folder}/${file}`, header);

	//body
	let options = {
		// append: false,
		delimiter: ',',
		header: target.headers,
		log: true
	};

	csvdata.write(`${folder}/${fileName}`, target.dataset, options);

	console.log('-----------------');
}