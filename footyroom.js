/**
 * Created by Nadim on 1/1/2017.
 */

'use strict';

/*
 * Requires
 */
const TeleBot = require('telebot');
const request = require('request');
var   cache = require('js-cache');
var   vsprintf = require("sprintf-js").vsprintf;

var botToken = process.argv[2];

const bot = new TeleBot({
    token: botToken, // Bot token should be provided when running this script.
    polling: { // Optional. Use polling.
        interval: 1, // Optional. How often check updates (in ms).
        timeout: 100, // Optional. Update polling timeout (0 - short polling).
        limit: 100, // Optional. Limits the number of updates to be retrieved.
        retryTimeout: 5000 // Optional. Reconnecting timeout (in ms).
    }
});

function Context (inlineCtx) {
		this.queryCtx   = inlineCtx;
		this.answers    = bot.answerList(this.queryCtx, { cacheTime: 300 });
		this.maxAnswers = 0;
		this.page       = 0;
		this.callback   = "";
}

const configuration = new function () {
	this.latestHighlightsMaxResults = 20; // should in a form of (page * per_page)
	this.teamHighlightsMaxResults = 10;	
}

// answer an inline query
function sendAnswer(answers) {
    console.log('[BOT] sending answer');
    bot.answerQuery(answers)
        .catch(error => {
        console.log('[BOT] error: ' + error + 'while sending answer');
    });
}

function getLatestHighlightsDone(answers, page) {
    console.log('[BOT] processing answer of length: ' + answers.list.length);
    answers.nextOffset = page;
	sendAnswer(answers);

}

function getLatestHighlights(inlineCtx) {	
    let page = parseInt(inlineCtx.offset) || 0;
    if (page == 0) {
        page++;
    }
	
	if (page > api.maxPageNumber) {
		return;
	}

	// Init context
	var context = new Context(inlineCtx.id);
	context.maxAnswers = configuration.latestHighlightsMaxResults;
	context.page       = page;
	context.callback   = getLatestHighlightsDone;
	
	api.getLatestHighlights(context)
}

function getLatestPremierLeagueHighlights(inlineCtx) {	
    let page = parseInt(inlineCtx.offset) || 0;
    if (page == 0) {
        page++;
    }
	
	if (page > api.maxPageNumber) {
		return;
	}

	// Init context
	var context = new Context(inlineCtx.id);
	context.maxAnswers = configuration.latestHighlightsMaxResults;
	context.page       = page;
	context.callback   = getLatestHighlightsDone;
	
	api.getLatestPremierLeagueHighlights(context)
}

function getLatestTeamHighlights(inlineCtx, query) {	
    let page = parseInt(inlineCtx.offset) || 0;
    if (page == 0) {
        page++;
    }
	
	if (page > api.maxPageNumber) {
		return;
	}

	// Init context
	var context = new Context(inlineCtx.id);
	context.maxAnswers = configuration.teamHighlightsMaxResults;
	context.page       = page;
	context.callback   = getLatestHighlightsDone;
	
	api.getLatestTeamHighlights(context, query);
}

// On inline query
bot.on('inlineQuery', inlineCtx => {
    let query = inlineCtx.query;

    console.log(`[BOT] inline query: ${query}`);

    if (query === '') {
        getLatestHighlights(inlineCtx);
    } else if (query === 'pl') {
		getLatestPremierLeagueHighlights(inlineCtx)
	} else {
		getLatestTeamHighlights(inlineCtx, query);
	}
});

/*
 * API URLs
 */
const urls = new function () {
	this.commonArg = "matches?api_key=f7d851bb79ac8a658e9c11d5e3c89f39&status_type=finished&has_post=1&";
	this.pageArg = "page=%d&";
	this.premierLeagueArg = "stage_tree=5,3181&";
	this.footyApi = "http://admin.footyroom.com/api/v2/";
	this.latestHighlights = this.footyApi + this.commonArg + this.pageArg;
	this.premierLeagueHighlights = this.latestHighlights + this.premierLeagueArg;
	this.highlightsSearch = "http://footyroom.com/search.json?q=%s";
	this.matchHighlights = this.footyApi + this.commonArg + this.pageArg + "match_id=%s";
}
	
/*
 * API Implementation
 */
var api = new function() {
	this.maxPageNumber = 8;
	
	this.getHighlights = function(context, url, callback) {
		//console.log('[API] calling ' + url + ' for page: ' + context.page);
		request(url, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				//console.log(body);

				var highlights = JSON.parse(body);

				for (var i = 0; i < highlights.per_page; i++) {

					// check if we already have enough answers
					if (context.answers.list.length === context.maxAnswers) {
						console.log('[API] we have enough answers, not continuing to read the page');
						break;
					}

					// sanity checks
					if (!highlights.data.length) {
						console.log('[API] no data in response for match. skipping.. ');
						continue;
					}

					if (!highlights.data[0].post.media.length) {
						console.log('[API] no media in response for match. skipping.. ');
						continue;
					}

					context.answers.addVideo({
						id: highlights.data[i].match_id.toString(),
						video_url: highlights.data[i].post.media[0].payload,
						mime_type: "text/html",
						thumb_url: highlights.data[i].post.thumbUrl,
						input_message_content: {
							message_text: '<strong>Watch: </strong>' +
							'<a href=\'' +
							highlights.data[i].post.media[0].payload + '\'>' +
							highlights.data[i].post.post_title + '</a>',
							parse_mode: 'HTML'
						},
						title: highlights.data[i].post.post_title
					});
				}
			}
			
			callback(context);
		});
	}
	
	this.getTeamHighlights= function(context, url, callback) {
		request(url, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				//console.log(body);

				var teamHighlights = JSON.parse(body);

				console.log('[API] found ' + teamHighlights.matches.length + ' matches');

				/**
				 * the number of highlights in the response would be the minimum
				 * of the maximum number of highlights we want to return, and the
				 * actual number of highlights that we found
				 */
				const maxResults = Math.min(teamHighlights.matches.length, configuration.teamHighlightsMaxResults);

				var processed = 0;
				
				for (var i = 0; i < maxResults; i++) {
					var matchId = teamHighlights.matches[i].matchId.toString();
					console.log('[API] getting highlights of match: ' + matchId);
					const url = vsprintf(urls.matchHighlights, [1, matchId]);
					request(url, function (error, response, body) {
						if (!error && response.statusCode == 200) {

							//console.log(body);

							var matchHighlights = JSON.parse(body);

							if (!matchHighlights.total) {
								console.log('[API] match not found');
								callback(context, ++processed, maxResults);
								return;
							}

							if (!matchHighlights.data.length) {
								console.log('[API] no data in response for match');
								callback(context, ++processed, maxResults);
								return;
							}

							if (!matchHighlights.data[0].post.media.length) {
								console.log('[API] no media in response for match');
								callback(context, ++processed, maxResults);
								return;
							}

							context.answers.addVideo({
								id: matchHighlights.data[0].match_id.toString(),
								video_url: matchHighlights.data[0].post.media[0].payload,
								mime_type: "text/html",
								thumb_url: matchHighlights.data[0].post.thumbUrl,
								input_message_content: {
									message_text: '<strong>Watch: </strong>' +
									'<a href=\'' +
									matchHighlights.data[0].post.media[0].payload + '\'>' +
									matchHighlights.data[0].post.post_title + '</a>',
									parse_mode: 'HTML'
								},
								title: matchHighlights.data[0].post.post_title
							});

							callback(context, ++processed, maxResults);
						}
					});
				}
			}
		});
	}
	
	this.getLatestHighlightsByPageDone = function(context) {
		console.log('[API] got ' + context.answers.list.length + ' answers. max answers ' +  context.maxAnswers);
		++(context.page); // increase the page for the next search
		if ((context.answers.list.length < context.maxAnswers) &&
		    (context.page <= api.maxPageNumber)) {
			console.log('[API] more answers required');
			api.getLatestHighlightsByPage(context, context.page);
		} else {
			context.callback(context.answers, context.page)
		}
	}
	
	this.getLatestTeamHighlightsDone = function(context, processed, total) {
		console.log('[API] got ' + processed + ' out of ' + total + ' answers');
		if (processed == total) {
			context.callback(context.answers, context.page);
		}		
	}
	
	this.getLatestHighlightsByPage = function(context, page) {
		console.log('[API] getting latest highlights. page: ' + page);
		const url = vsprintf(urls.latestHighlights, [page]);
		this.getHighlights(context, url, this.getLatestHighlightsByPageDone);
	}
	
	this.getLatestPremierLeagueHighlightsByPage = function(context, page) {
		console.log('[API] getting latest permier league highlights. page: ' + page);
		const url = vsprintf(urls.premierLeagueHighlights, [page]);
		this.getHighlights(context, url, this.getLatestHighlightsByPageDone);
	}
	
	this.getLatestTeamHighlights = function(context, query) {
		console.log('[API] getting latest team highlights of: ' + query);
		const url = vsprintf(urls.highlightsSearch, [query]);
		this.getTeamHighlights(context, url, this.getLatestTeamHighlightsDone)
	}
	
	this.getLatestHighlights = function(context) {
		this.getLatestHighlightsByPage(context, context.page);
	}
	
	this.getLatestPremierLeagueHighlights = function(context) {
		this.getLatestPremierLeagueHighlightsByPage(context, context.page);
	}	
}

/*
 * Boot startup
 */
bot.connect();