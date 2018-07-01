/*jshint esversion: 6 */

//Modules
const rp = require('request-promise');
const cheerio = require('cheerio');
const jsonfile = require('jsonfile');
const csvdata = require('csvdata');
const readline = require('readline');
const colors = require('colors');
const fs = require('fs');
 
//-------------

//Initialize variables
let dataset = [];
let pageLimit = 10; // default:10 // -1 -> no limit
let externalPageNumber = 0;

let datetime = new Date();
datetime = `${datetime.getDate()}-${(datetime.getMonth()+1)}-${datetime.getFullYear()}`;

let targetWebsite = {
	name: "Compos",
	baseUrl:"http://www.e-compos.org.br/e-compos/"
};

let rpOptions = {
	transform: function (body) {
	  return cheerio.load(body);
	}
};

//asesse varuable pass throug command line
process.argv.forEach((val, index) => {
	//limit
	if (val.substr(0,6) == "limit=") {
		setLimit(val);
	}
});

//set page limit
function setLimit(val) {
	let limit = val.split("=");
	let l = +limit[1];
	if(Number.isInteger(l)) {
		pageLimit = l;
		console.log(`Page limit set to ${l}.`);
	} else {
		console.log("Page limit must be a number. Default: 10 // Unlimited: -1 .");
	}
}

//----------------------------

console.log("Webscraper for Open Journal System".green);

setup();

//setup question in the beginning
function setup() {

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});


	rl.question(`Target website name? ` + `(Default: ${targetWebsite.name}): `.grey, (name) => {
		if (name.length > 0) targetWebsite.name = name;
	
		rl.question(`Target website url? ` + `(Default: ${targetWebsite.baseUrl}): `.grey, (url) => {
			if (url.length > 0) targetWebsite.baseUrl = url;
		
			rl.question(`Page limit? ` + ` (Default: ${pageLimit}): `.grey, (limit) => {
				if (limit.length > 0) pageLimit = limit;
				
				initScrapper();
				rl.close();
			});
		});
		
	});
}

//----------------------------//
//initiate

// initScrapper();
function initScrapper() {
	console.log(`-----------------`);
	console.log(`Initializing scrapping.`);
	console.log(`Journal: ${targetWebsite.name} | Website: ${targetWebsite.baseUrl}`);
	console.log(`-----------------`);
	console.log(`Scraping archive pages.`);
    addPageToScrape();
}

//add external page
function addPageToScrape() {
	externalPageNumber++;
	rpOptions.uri = `${targetWebsite.baseUrl}search/titles?searchPage=${externalPageNumber}#results`;
	loadURL("external");
}

//delay load pages to scrapper
function sleeper(ms) {
	return function(x) {
	  return new Promise(resolve => setTimeout(() => resolve(x), ms));
	};
  }

//load 
function loadURL(type, articleID) {

	//loadd promise
	rp(rpOptions)
		.then(sleeper(100))
		.then(($) => {
			
			//extennal
			if(type == "external") {

				//Test if page has results
				//Parse results, or move to load results details
				let error404 = $("#results").find(".nodata");
				
				if(error404.length == 0) {
					parseExternal($);
				} else {
					console.log(`No more pages to scrape. Scraping details`);
					console.log(`--------------`);
					loadNextDetails();
				}

			} else {

				//internal
				parseInternal($,articleID);
			}

		})
		.catch((err) => {
			console.log(err);
		});

}

//parse external page
function parseExternal($) {

	const pageN = externalPageNumber;
	console.log(`scraping page: ${pageN}`);

	const lines = $('#results').find("tr"); //lines

	lines.each(function(i, line) {

		line = $(line);

		//only gets the lines with information.
		//edition, number, title, and link to abstract are in the lines with the attribute 'valign' = 'top'
		//author name is in the subsequent line

		if (line.attr("valign") == "top") {
			
			//cells in each line
			const cells = $(line.find('td'));

			//variables to save
			let id, volume, number, year, title, url, pdf, authors;
			
			// 1. volume and number is in the first column
			let cellEdition = $(cells[0]);
			cellEdition = $(cellEdition.find("a"));
			let edition = cellEdition.text();

			if (edition == "Ahead of Print") {
				volume = edition;
			} else {
				let yearRegex = /\(\b(\d{4})\)/; //(2014)
				let yearRegexMatch = edition.match(yearRegex);
				year = yearRegexMatch[1];

				let volRegex = /v. (\d{1,2})/; //v. 2
				let volumeMatch = edition.match(volRegex);
				if (volumeMatch) volume = volumeMatch[1];

				let numRegex = /n. (\d{1,2})/; // n. 3
				let numberMatch = edition.match(numRegex);
				if (numberMatch != null) number = numberMatch[1];

			}

			//2. title is in the second cell// 
			title = $(cells[1]).text();
			
			 //3.  url is in the thirs cell//
			let urls = $(cells[2]).find("a");
			url = $(urls[0]).attr("href");
			pdf = $(urls[1]).attr("href");

			//4. get item ID from URL
			let idRegex = /\/(\d{1,})/; 
			let idMatch = url.match(idRegex);
			id = idMatch[1];

			//get author in the next line
			let authorsLine = $(line.next());
			let authorCell = $(authorsLine[0]).find("td");
			authors = $(authorCell).text();
			
			 authors = authors.trim(); // remove white space
			 authors = authors.split(",");
			 for(let i=0; i<authors.length;i++) {
				 authors[i] = authors[i].trim();
			 }
			 
			 //data
			 let article = {
				id: id,
				index: dataset.length,
				authors: authors,
				title: title,
				volume: volume,
				number: number,
				year: year,
				url: url,
				pdf: pdf,
				complete: false
			};
			
			//sava data
			dataset.push(article);
			
		}

	});

	//check page page limit
	// if reach the limit, stop gathering extrnal pages and start collecting dedtails.
	if(pageLimit > 0 && externalPageNumber >= pageLimit) {
		console.log(`Page limit rechead (increase pagelimit for more). Scraping details`);
		console.log(`--------------`);
		loadNextDetails();
	} else {
		addPageToScrape();
	}

}

//select next article to collect detail
function loadNextDetails(articleIndex) {

	//if articleIndex is undefined, set to 0 (first call)
	if (articleIndex == undefined) articleIndex = 0;

	//contine to call the next if index is lower than the total
	if (articleIndex < dataset.length) {
		const article = dataset[articleIndex];
		rpOptions.uri = `${targetWebsite.baseUrl}article/view/${article.id}`;
		loadURL("internal",article.id);
	} else {
		finish();
	}
	
}

//parse internal page
function parseInternal($,articleID) {

	//call article on the list
	let article = dataset.find(item => item.id == articleID);

	console.log(`scraping article: ${articleID} (${article.index}/${dataset.length})`);

	//variables
	let title, authors, abstract, keywords, doi;

	// 1. title
    title = $("#articleTitle").text();
	
	// 2. Authors
	authors = $("#authorString").text();
	authors = authors.split(",");

	// 3. abstract
	abstract = $("#articleAbstract").find("div").text();
	abstract = abstract.replace(/\n/g," "); ////check if there is line break

	 // 4. keywordsd
	keywords = $("#articleSubject").find("div").text();
	
	 //break into array .. three types of separation foundd in the website (,) or (;) or (.).. remove the last if empty 
	keywords = keywords.split(",");
	if (keywords.length == 1) keywords = keywords[0].split(";");
	if (keywords.length == 1) keywords = keywords[0].split(".");
	if (keywords[keywords.length-1] == "") keywords.pop();

	// 5. DOI
	doi = $("a[id='pub-id::doi']").text();
	
	//data
	let details = {
        title: title,
        authors: authors,
        abstract: abstract,
        keywords: keywords,
        doi: doi
	};

	//save  data
	article.keywords = details.keywords;
    article.abstract = details.abstract;
    article.doi = details.doi;

    article.details = details;
	article.complete = true;
	
	//call next
	const nextIndex = article.index + 1;
	loadNextDetails(nextIndex);

}

//finish
function finish() {

	let articlesComplete = dataset.filter(article => article.complete == true);

	console.log(`-----------------`);
	console.log(`Done! ${articlesComplete.length}/${dataset.length}`);
	console.log(`-----------------`);

	//remove irrelevant data
	for (const article of dataset) {
		delete article.index;
		delete article.complete;
	}

	//parse, transform and save in both CSV and JSON

	getCSV();
	getJson();

}

//get JSON
function getJson() {

	console.log(`Writing data to ${targetWebsite.name}-${datetime}.json`);

	const folder = './results';

	if (!fs.existsSync(folder)) fs.mkdirSync(folder);

	const file = `${targetWebsite.name}-${datetime}.json`;

	jsonfile.writeFile(`${folder}/${file}`, dataset, {spaces: 4}, function (err) {
		if (err) {
			console.log(err);
		} else {
			console.log("Json: Data written!".green);

			console.log(`-----------------`);
		}
	});

}

//get CSV
function getCSV() {

	const folder = './results';

	if (!fs.existsSync(folder)) fs.mkdirSync(folder);

	const file = `${targetWebsite.name}-${datetime}.csv`;

	//header
	let header = 'id,authors,title,volume,number,year,url,pdf,keywords,abstract,doi';
	csvdata.write(`${folder}/${file}`, header);

	//body
	let options = {
		append: true,
		header: header,
		log: true
	};

	csvdata.write(file, dataset, options);

	console.log(`-----------------`);
}