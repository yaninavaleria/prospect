// This file contains:
//		PViewFrame Objects
//		Immediately Invoked Function Expression for launching processes and organizing screen

// NOTES: 	prspdata will pass the following information:
//				a = array of Attribute definitions { id, def, r, l }
//				t = array of Template definitions (no Joins) and Record numbers: { id, def, n }
//				e = Volume definition { id, g, vf, i }
//				m = overlay map data

	// GLOBAL CONSTANTS

	// GLOBAL VARS
var volURL;

var widgetData = {			// Widget state has to be global because YouTube API calls global function
							// Therefore code cannot rely upon closure to know state of widget data
	ytLoaded: false,			// YouTube not initially loaded
	ytCall: null,				// function to call once YouTube loaded
	ytCode: null, 				// YouTube code to video to play
	timer: null,				// Timer function for polling playhead
	extract: null,				// String of transcript extract timecodes
	sTime: null,				// start time for any extract in milliseconds
	eTime: null,				// end time for any extract in milliseconds
	playing: false,				// true if widget currently playing
	widget: null,				// JS playback widget object
	xscriptOn: false,			// Transcript showing
	tcArray: null,				// Array of timecode records { s[tart], e[nd] } in milliseconds
	tcIndex: -1 				// Index of playhead in tcArray
};


// ===================================================================================
// PViewFrame: Pseudo-object that manages contents of visualization frame
//				Creates Legend and maintains selection (passed to PVizModel on update)
// INPUT: 	vfIndex = index for this visualization frame (0 or 1)

function PViewFrame(vfIndex)
{
	var instance = { };			// creates pseudo-instance of Object

	// INSTANCE VARIABLES
	//===================

	var vizSelIndex = 0;		// index of currently selected Viz
	var vizModel = null;		// PVizModel currently in frame
	var legendIDs = [];			// Attribute IDs of Legend selections (one per Template)
	var lDirty = null;			// Legend Dirty (enabled) if true
	var datastream = null;		// pointer to datastream given to view
	var selAbsIs = [];			// array of absI's of selected Records from text frame
	var vizSel = [];			// array of absI's of selected Records that are actually visible

	// PRIVATE FUNCTIONS
	//==================

		// PURPOSE: Check selAbsI from text frame against Records shown in view, Highlight those shown
	function computeSel()
	{
		vizSel=[];

		if (vizModel == null) {
			return;
		}

		if (selAbsIs.length === 0) {
			vizModel.clearSel();
			return;
		}

		var r = vizModel.rMap;
		selAbsIs.forEach(function(absI) {
			if (r[absI >> 4] & (1 << (absI & 15))) {
				vizSel.push(absI);
			}
		});
		if (vizSel.length === 0) {
			vizModel.clearSel();
			doSelBtns(false);
		} else {
			vizModel.setSel(vizSel);
			doSelBtns(true);
		}
	} // computeSel()

		// PURPOSE: Set Legend Dirty flag to true or false
	function setLDirty(s)
	{
		if (s !== lDirty) {
			lDirty = s;
			jQuery(getFrameID()+' div.lgnd-container div.lgnd-handle button.lgnd-update').prop('disabled', !s);
		}
	} // setLDirty

		// PURPOSE: Return ID of Frame's outermost DIV container
	function getFrameID()
	{
		return '#view-frame-'+vfIndex;
	} // getFrameID()


	function selectChangeViz(event)
	{
		var selector = jQuery(getFrameID()+' div.view-controls select.view-viz-select option:selected');
		var newSelIndex   = selector.val();
		PState.set(PSTATE_BUILD);
		createViz(newSelIndex, true);
		computeSel();
		PState.set(PSTATE_READY)
	} // selectChangeViz()


	function clickShowHideLegend(event)
	{
		if (vizModel.flags() & V_FLAG_LGND) {
			jQuery(getFrameID()+' div.lgnd-container').toggle('slide', { direction: "left" });
		}
		event.preventDefault();
	} // clickShowHideLegend()


		// PURPOSE: Open Record Inspector for current selection
	function clickOpenSelection(event)
	{
		var container = jQuery('#inspect-content');
		var avAttID=null;	// ID of any A/V widget or null
		var avType=0;		// 0=none, 1=SoundCloud, 2=YouTube, 3=Native Audio
		var t2URL;			// URL for transcript 2 or null
			// Set default size -- change acc to widget settings & overrides
		var w=450;
		var h=400;

		function tTrim(str)
		{
			return str.replace(/^[ \f\t\v​]+|[ \f\t\v​]+$/g, '');
		}
			// PURPOSE: Convert timecode string into # of milliseconds
			// INPUT:   timecode must be in format [HH:MM:SS] or [HH:MM:SS.ss]
			// ASSUMES: timecode in correct format, parseTC contains compiled RegEx
		function tcToMilliSecs(tc)
		{
			var milliSecs = new Number();
			var match = parseTC.exec(tc);
			if (match !== null) {
				milliSecs = (parseInt(match[1])*3600 + parseInt(match[2])*60 + parseFloat(match[3])) * 1000;
					// The multiplier to use for last digits depends on if it is 1 or 2 digits long
				if (match[4].length == 1) {
					milliSecs += parseInt(match[4])*100;
				} else {
					milliSecs += parseInt(match[4])*10;
				}
			} else {
				throw new Error("Error in transcript file: Cannot parse " + tc + " as timecode.");
				milliSecs = 0;
			}
			return milliSecs;
		} // tcToMilliSecs()

			// PURPOSE: Format the second transcript (use first one's timecodes)
		function formatXscript2(text, xtbl)
		{
			var splitXcript = new String(text);
				// AJAX server request processes any extract
			splitXcript = tTrim(splitXcript).split(/\r\n|\r|\n/g);

			var ta = [];

			if (splitXcript) {
				var tb;
				var ti = 0;
				_.each(splitXcript, function(val) {
						// Skip values with line breaks...basically empty items
					val = tTrim(val);
					if (val.length>0) {
						if (val.charAt(0) === '[') {
							if (ti>0) {
								ta.push(tb);
							}
							tb='';
						} else {
							if (tb.length > 0)
								tb += '<br/>';
							tb += val;
						}
						ti++;
					}
				});
			}

				// Loop thru HTML for left-side transcript and add right-side text
			 _.each(ta, function(val, ti) {
				xtbl.find('div.timecode[data-tcindex="'+ti+'"]').next().after('<div class="xscript">'+val+'</div>');
			 });
		} // formatXscript2()

			// PURPOSE: Format the first transcript (with its timecodes)
		function formatXscript1(text)
		{
				// empty time code array -- each entry has start & end
			widgetData.tcArray = [];
			widgetData.tcIndex = -1;
			var tcs = widgetData.tcArray;

				// split transcript text into array by line breaks
			var splitXcript = new String(text);
				// Server request processes any extract
			splitXcript = tTrim(splitXcript).split(/\r\n|\r|\n/g);

			if (splitXcript) {
				var xtbl = jQuery('#xscript-tbl');
				var tcI = 0;
				var timeCode, lastCode=0, lastStamp=0;
				var tb='';		// Text block being built
				_.each(splitXcript, function(val) {
						// Each entry is (1) empty/line break, (2) timestamp, or (3) text
					val = tTrim(val);
						// Skip empty entries, which were line breaks
					if (val.length>1) {
							// Encountered timestamp -- compile previous material, if any
						if (val.charAt(0) === '[' && (val.charAt(1) >= '0' && val.charAt(1) <= '9'))
						{
							timeCode = tcToMilliSecs(val);
							if (tb.length > 0) {
									// Append timecode entry once range is defined
								if (lastStamp) {
									tcs.push({ s: lastCode, e: timeCode });
								}
								xtbl.append('<div class="row"><div class="timecode" data-timecode="'+
									lastCode+'" data-tcindex="'+tcI++ +'">'+lastStamp+'</div><div class="xscript">'+tb+'</div></div>');
								tb = '';
							}
							lastStamp = val;
							lastCode = timeCode;

							// Encountered textblock
						} else {
							if (tb.length > 0)
								tb += '<br/>';
							tb += val;
						}
					} // if length
				}); // _each
					// Handle any dangling text
				if (tb.length > 0) {
						// Append very large number to ensure can't go past last item! 9 hours * 60 minutes * 60 seconds * 1000 milliseconds
					tcs.push({ s: lastCode, e: 32400000 });
					xtbl.append('<div class="row"><div class="timecode" data-timecode="'+
						lastCode+'" data-tcindex="'+tcI+'">'+lastStamp+'</div><div class="xscript">'+tb+'</div></div>');
				}
					// Is there is a 2nd transcript? Load it so it is appended to this set
				if (typeof t2URL !== 'undefined' && t2URL != null) {
					jQuery.ajax({
						type: 'POST',
						url: prspdata.ajax_url,
						data: {
							action: 'prsp_get_transcript',
							transcript: t2URL,
							excerpt: widgetData.extract
						},
						success: function(data, textStatus, XMLHttpRequest) {
							formatXscript2(JSON.parse(data), xtbl);
						},
						error: function(XMLHttpRequest, textStatus, errorThrown) {
						   alert(errorThrown);
						}
					});
				}
			} // if (split)
		} // formatXscript1()

			// PURPOSE: Update the timecode playhead if changed from last update
		function highlightXscript(ms)
		{
			var match;
			var oldI = widgetData.tcIndex;

			_.find(widgetData.tcArray, function(tc, tcI) {
				match = (tc.s <= ms && ms < tc.e);
				if (match && tcI != oldI) {
						// Should we synchronize audio and text transcript?
					var xt = jQuery('#xscript-tbl');
					if (document.getElementById("sync-xscript").checked) {
						var tsEntry = xt.find('[data-tcindex="'+tcI+'"]');
						var topDiff = tsEntry.offset().top - xt.offset().top;
						var scrollPos = xt.scrollTop() + topDiff;
						xt.animate({ scrollTop: scrollPos }, 300);
					}
					if (oldI != -1)
						xt.find('[data-tcindex="'+oldI+'"]').removeClass('current');
					xt.find('[data-tcindex="'+tcI+'"]').addClass('current');
					widgetData.tcIndex = tcI;
				}
				return match;
			});
		} // highlightXscript()

			// PURPOSE: Called by global function once YouTube API loaded
		function ytActivate()
		{
			function ytStateChange(event)
			{
				var curPos;

				switch (event.data) {
				case 1: // YT.PlayerState.PLAYING
					widgetData.playing = true;
					if (widgetData.timer == null) {
							// YouTube playback heartbeat
						widgetData.timer = setInterval(function() {
								// Need to convert to milliseconds
							curPos = widgetData.widget.getCurrentTime() * 1000;
								// Keep within bounds of excerpt is done automatically by cue function
								// If there is a transcript, highlight current section
							if (widgetData.playing && widgetData.xscriptOn) {
								highlightXscript(curPos);
							}
						}, 300);    // .3 second heartbeat
					}
					break;
				case 0: // YT.PlayerState.ENDED
				case 2: // YT.PlayerState.PAUSED
					widgetData.playing = false;
					window.clearInterval(widgetData.timer);
					widgetData.timer = null;
					break;
				case 3: // YT.PlayerState.BUFFERING
				case 5: // YT.PlayerState.CUED
					widgetData.playing = false;
					break;
				} // switch event
			} // ytStateChange()

			widgetData.widget = new YT.Player('yt-widget', {
				width: w-40, height: Math.floor(((w-40)*9)/16),
				videoId: widgetData.ytCode,
				events: {
					onError: function(event) { console.log("YouTube Error: "+event.data); },
					onStateChange: ytStateChange,
					onReady: function() {
							// If this is to play an excerpt, specify time bounds now (in seconds)
						if (widgetData.extract) {
							widgetData.widget.cueVideoById(
								{   videoId: widgetData.ytCode,
									startSeconds: (widgetData.sTime/1000),
									endSeconds: (widgetData.eTime/1000)
								});
						}
					}
				}
			});
		} // ytActivate()

			// Need to define native audio eventListeners here for add and remove
			// ==================
		function naWidgetPlaying()
		{
			widgetData.playing = true;
		}
		function naWidgetStopped()
		{
			widgetData.playing = false;
		}
		function naWidgetUpdate()
		{
			if (widgetData.playing && widgetData.xscriptOn) {
				highlightXscript(widgetData.widget.currentTime * 1000);
			}
		}

			// Inspector will either close or move to next Record -- remove all listeners, etc
		function unplugAllWidgets()
		{
				// Stop any A/V playing
			switch(avType) {
			case 3:
				if (widgetData.widget != null) {
					widgetData.widget.removeEventListener("ended", naWidgetStopped);
					widgetData.widget.removeEventListener("pause", naWidgetStopped);
					widgetData.widget.removeEventListener("playing", naWidgetPlaying);
					widgetData.widget.removeEventListener("timeupdate", naWidgetUpdate);
				}
			case 1:
				if (widgetData.widget != null && widgetData.playing)
					widgetData.widget.pause();
				widgetData.playing = false;
				widgetData.widget = null;
				break;
			case 2:
					// Prevent invoking player if code called after modal closed
				widgetData.ytCall = null;
					// Silence YouTube player if modal closed in another way
				if (widgetData.widget != null && widgetData.playing)
					widgetData.widget.stopVideo();
				widgetData.widget = null;
				widgetData.playing = false;
				if (widgetData.timer != null) {
					window.clearInterval(widgetData.timer);
					widgetData.timer = null;
				}
				break;
			} // switch
		} // unplugAllWidgets()

		var recSel=null;

		recSel = vizSel;
		if (recSel == null || recSel.length == 0)
			return;

		var inspector;
		var rec;
		var i=0;		// Index of item to show in Inspector from selection

		function inspectShow()
		{
			var recAbsI = recSel[i];
			rec = PData.rByN(recAbsI);
			var title = ' '+rec.l+' ('+(i+1)+'/'+recSel.length+') ';
			var nameDOM = jQuery('#inspect-name');
			nameDOM.text(title);
			nameDOM.prop('title', rec.id);
				// Which template type?
			var tI = PData.n2T(recAbsI);

				// PURPOSE: Prepare start and end times for extract if any
				// ASSUMES: Any timecode given contains both start and end separated by "-"
			function getSETimes()
			{
				widgetData.sTime = widgetData.eTime = null;
				var tcAttID;
				if (tcAttID = prspdata.e.i.t.tcAtts[tI]) {
					var tcAttVal = rec.a[tcAttID];

					if (tcAttVal && tcAttVal !== '') {
						widgetData.extract = tcAttVal;
						var tcs = tcAttVal.split('-');
						widgetData.sTime = tcToMilliSecs(tcs[0]);
						widgetData.eTime = tcToMilliSecs(tcs[1]);
					}
				}
			} // getSETimes()

			container.empty();
				// Handle Inspector widgets
			avAttID=null; avType=0;
			widgetData.extract=null;
			widgetData.xscriptOn=false;
			widgetData.playing=false;

				// Audio widget?
			if (prspdata.e.i.modal.scOn || (typeof prspdata.e.i.modal.aOn === 'boolean' && prspdata.e.i.modal.aOn)) {
				if (avAttID = prspdata.e.i.sc.atts[tI]) {
					var scAttVal;
					if (scAttVal = rec.a[avAttID]) {
						getSETimes();
							// Is this a URL to SoundCloud?
						if (scAttVal.match(/soundcloud\.com/)) {
							var primeAudio=true;

							avType=1;
							container.append('<iframe id="sc-widget" class="player" width="100%" height="110" src="http://w.soundcloud.com/player/?url='+
								scAttVal+'"></iframe>');

								// Must set these variables after HTML appended above
							var playWidget = SC.Widget(document.getElementById('sc-widget'));
							widgetData.widget = playWidget;
								// Setup SoundCloud player after entire sound clip loaded
							playWidget.bind(SC.Widget.Events.READY, function() {
									// Prime the audio -- must initially play (seekTo won't work until sound loaded and playing)
								playWidget.play();
								playWidget.bind(SC.Widget.Events.PLAY, function() {
									widgetData.playing = true;
								});
								playWidget.bind(SC.Widget.Events.PAUSE, function() {
									widgetData.playing = false;
								});
								playWidget.bind(SC.Widget.Events.PLAY_PROGRESS, function(params) {
										// Pauses audio after it primes so seekTo will work properly
									if (primeAudio) {
										playWidget.pause();
										primeAudio = false;
										widgetData.playing = false;
									}
										// Keep within bounds if only excerpt of longer transcript
									if (widgetData.extract) {
										if (params.currentPosition < widgetData.sTime) {
											playWidget.seekTo(widgetData.sTime);
										} else if (params.currentPosition > widgetData.eTime) {
											playWidget.pause();
											widgetData.playing = false;
										}
									}
									if (widgetData.playing && widgetData.xscriptOn) {
										highlightXscript(params.currentPosition);
									}
								});
									// Can't seek within the SEEK event because it causes infinite recursion
								playWidget.bind(SC.Widget.Events.FINISH, function() {
									widgetData.playing = false;
								});
							});
						} else {	// Use "native" audio
							avType=3;
								// If there is timecode extract, need to append to URL
							if (widgetData.extract) {
								var tcs = widgetData.extract.split('-');
								scAttVal += '#t='+tcs[0]+','+tcs[1];
							}
							container.append('<audio id="na-widget" controls src="'+scAttVal+'"></audio>');
							widgetData.widget = document.getElementById('na-widget');
							widgetData.widget.addEventListener("ended", naWidgetStopped);
							widgetData.widget.addEventListener("pause", naWidgetStopped);
							widgetData.widget.addEventListener("playing", naWidgetPlaying);
							widgetData.widget.addEventListener("timeupdate", naWidgetUpdate);
						}
					} // if scAttVal
				} // if avAttID
			} // if scOn

				// YouTube video widget?
			if (avType === 0 && prspdata.e.i.modal.ytOn) {
				if (avAttID = prspdata.e.i.yt.atts[tI]) {
					var ytAttVal = rec.a[avAttID];
					if (ytAttVal) {
						getSETimes();
						widgetData.ytCode = ytAttVal;

						container.append('<div id="yt-widget"></div>');

							// YouTube API is only loaded once but must handle race condition:
							//	Inspector modal can be closed before video fully loaded
						widgetData.ytCall = ytActivate;
						if (!widgetData.ytLoaded) {
							widgetData.ytLoaded = true;

								// Create a script DIV that will cause API to be loaded
							var tag = document.createElement('script');
							tag.src = "https://www.youtube.com/iframe_api";
							var scriptTag = document.getElementsByTagName('script')[0];
							scriptTag.parentNode.insertBefore(tag, scriptTag);
								// wait for hook invocation to set playWidget and bind handlers
						} else
							ytActivate();

						avType=2;
					}
				} // if avAttID
			} // if ytOn

				// Transcription widget?
			if (prspdata.e.i.modal.tOn) {
				var t1AttID = prspdata.e.i.t.t1Atts[tI];
					// Is there a 1st transcript Attribute?
				if (t1AttID && t1AttID !== '' && t1AttID !== 'disable') {
					var t1URL = rec.a[t1AttID];
					if (typeof t1URL === 'string' && t1URL !== '') {
							// Add synchronize button if both A/V and Transcript
						if (avType > 0) {
							container.append('<div>'+document.getElementById('dltext-sync-xscript').innerHTML+'</div>');
						}
						container.find('#xscript-tbl').remove();
						container.append('<div id="xscript-tbl"></div>');
						widgetData.xscriptOn=true;
							// Handle clicks on timecodes
						jQuery('#xscript-tbl').click(function(evt) {
							if (avType && jQuery(evt.target).hasClass('timecode')) {
								var seekTo = jQuery(evt.target).data('timecode');
									// seekTo doesn't work unless sound is already playing
								switch (avType) {
								case 1:
									if (!widgetData.playing) {
										widgetData.playing = true;
										widgetData.widget.play();
									}
									widgetData.widget.seekTo(seekTo);
									break;
								case 2:
									if (!widgetData.playing) {
										widgetData.playing = true;
										widgetData.widget.playVideo();
									}
										// YouTube player takes seconds (rather than milliseconds)
									widgetData.widget.seekTo(seekTo/1000);
									break;
								case 3:
									if (!widgetData.playing) {
										widgetData.playing = true;
										widgetData.widget.play();
									}
									widgetData.widget.currentTime = seekTo/1000;
									break;
								}
							}
						});

							// Is there a 2nd transcript Attribute?
							// Set up for 1st to load when complete
						t2URL=null;
						var t2AttID = prspdata.e.i.t.t2Atts[tI];
						if (t2AttID && t2AttID !== '' && t2AttID !== 'disable') {
							t2URL = rec.a[t2AttID];
						}

						jQuery.ajax({
							type: 'POST',
							url: prspdata.ajax_url,
							data: {
								action: 'prsp_get_transcript',
								transcript: t1URL,
								excerpt: widgetData.extract
							},
							success: function(data, textStatus, XMLHttpRequest) {
								formatXscript1(JSON.parse(data));
							},
							error: function(XMLHttpRequest, textStatus, errorThrown) {
							   alert(errorThrown);
							}
						});
					} // t1URL
				} // if t1AttID
			} // if tOn

				// Show all Attribute content data
			prspdata.e.i.modal.atts[tI].forEach(function(attID) {
				var attVal = PData.rAV(recAbsI, attID, false);
				if (attVal) {
					var theAtt = PData.aByID(attID);
					var html;
						// Special case - Labels that begin with underscore are "invisible"
					if (theAtt.def.l.charAt(0) == '_')
						html = '<div>'+attVal+'</div>';
					else {
						html = '<div><span class="att-label">'+theAtt.def.l+':</span> ';
							// Begin images on next line
						if (theAtt.def.t == 'I')
							html += '<br/>';
						html += attVal+'</div>';						
					}
					container.append(html);
				}
			});
		} // inspectShow()

		function inspectSlide(diff)
		{
			var newI = i+diff;
			if (newI == -1)
				newI = recSel.length-1;
			else if (newI == recSel.length)
				newI = 0;

			if (newI != i) {
				i = newI;
				unplugAllWidgets();
				inspectShow();
			}
		} // inspectSlide()

		function inspectLeft(event)
		{
			inspectSlide(-1);
		}
		function inspectRight(event)
		{
			inspectSlide(1);
		}

		if (prspdata.e.i.modal.scOn)
		{
			w=550;
		} // if SoundCloud

		if (prspdata.e.i.modal.ytOn)
		{
			w=Math.max(w,475);
			h=500;
		} // if YouTube

		if (prspdata.e.i.modal.tOn)
		{
			h+=100;
			if (prspdata.e.i.modal.t2On) {
				w = Math.max(750, Math.floor(jQuery(document).width()*.80));
				w = Math.min(900, w);
			} else
				w=Math.max(w,550);
		} // if Transcriptions

		if (typeof prspdata.e.i.modal.w === 'number') {
			w=prspdata.e.i.modal.w;
		}
		if (typeof prspdata.e.i.modal.h === 'number') {
			h=prspdata.e.i.modal.h;
		}

			// Stop pulsing while Inspector open
		doSelBtns(false);

			// Show first item & handle scroll buttons
		inspectShow();
		jQuery('#btn-inspect-left').click(inspectLeft);
		jQuery('#btn-inspect-right').click(inspectRight);

		inspector = jQuery("#dialog-inspector").dialog({
			width: w,
			height: h,
			modal: true,
			buttons: [
				{
					text: dlText.seerec,
					click: function() {
						window.open(prspdata.site_url+'?p='+rec.wp, '_blank');
					}
				},
				{
					text: dlText.close,
					click: function() {
						inspector.dialog("close");
					} // click
				}
			]
		});

		inspector.on("dialogclose", function(event, ui) {
			unplugAllWidgets();
			jQuery('#btn-inspect-left').off("click");
			jQuery('#btn-inspect-right').off("click");
				// turn pulsing back on
			doSelBtns(true);
				// Unbind Inspector from this view -- one off only
			inspector.off("dialogclose");
		});

		event.preventDefault();
	} // clickOpenSelection()

		// PURPOSE: Change state Highlight buttons
	function doSelBtns(enable)
	{
		var vCnxt = jQuery(getFrameID()+' div.view-controls');

		if (enable) {
			vCnxt.find('.osel').button("enable");
			vCnxt.find('.osel').addClass("pulse");
			vCnxt.find('.xsel').button("enable");
		} else {
			vCnxt.find('.osel').button("disable");
			vCnxt.find('.osel').removeClass("pulse");
			vCnxt.find('.xsel').button("disable");
		}
	} // doSelBtns()

	function clickHighlight(event)
	{
			// Send signal back to Prospect "main app" to create Highlight filter on this viz
		jQuery("body").trigger("prospect", { s: PSTATE_HILITE, v: vfIndex, t: vizModel.tUsed });
		event.preventDefault();
	} // clickHighlight()

	function clickClearSelection(event)
	{
		PState.set(PSTATE_UPDATE);
		if (vizModel) {
			vizModel.clearSel();
		}
		vizSel = selAbsIs = [];
		doSelBtns(false);
		PState.set(PSTATE_READY);
		event.preventDefault();
	} // clickClearSelection()

		// PURPOSE: Hide/show viz-specific controls on right side
	function clickVizControls(event)
	{
		if (vizModel) {
			vizModel.doOptions();
		}
		event.preventDefault();
	} // clickVizControls()

		// PURPOSE: Hide/show visualization-specific hint notes
	function clickVizNotes(event)
	{
		var d = jQuery("#dialog-vnotes").dialog({
			width: 300,
			height: 300,
			modal: true,
			buttons: [
				{
					text: dlText.ok,
					click: function() {
						d.dialog("close");
					}
				}]
		});
		event.preventDefault();
	} // clickVizNotes()

		// PURPOSE: Turn on or off all feature Attributes for tmpltIndex
	function doShowHideAll(tmpltIndex, show)
	{
		jQuery(getFrameID()+' div.lgnd-container div.lgnd-scroll div.lgnd-template[data-index="'+
								tmpltIndex+'"] div.lgnd-group input.lgnd-entry-check').prop('checked', show);
		setLDirty(true);
	} // doShowHideAll()


		// PURPOSE: Set state of locate attribute vIndex within Legend tmpltIndex to show
		// NOTE: 	GUI already updated
	function doLocateSelect(tmpltIndex, lID, show)
	{
		setLDirty(true);
	} // doLocateSelect()


		// PURPOSE: Make lID the only selected locate attribute for tmpltIndex
		// NOTE: 	Must update GUI
	function doLocateSelectOnly(tmpltIndex, lID)
	{
			// Deselect everything
		jQuery(getFrameID()+' div.lgnd-container div.lgnd-scroll div.lgnd-template[data-index="'+
								tmpltIndex+'"] div.lgnd-locate input.lgnd-entry-check').prop('checked', false);
			// Just reselect this one
		jQuery(getFrameID()+' div.lgnd-container div.lgnd-scroll div.lgnd-template[data-index="'+
								tmpltIndex+'"] div.lgnd-locate[data-id="'+lID+'"] input.lgnd-entry-check').prop('checked', true);
		setLDirty(true);
	} // doLocateSelect()


		// PURPOSE: Set state of feature attribute vIndex within Legend tmpltIndex to show
		// NOTE: 	GUI already updated
	function doFeatureSelect(tmpltIndex, vIndex, show)
	{
		setLDirty(true);
	} // doFeatureSelect()


		// PURPOSE: Make vIndex the only selected feature attribute for tmpltIndex Legend
		// NOTE: 	Must update GUI
	function doFeatureSelectOnly(tmpltIndex, vIndex)
	{
			// Deselect everything
		jQuery(getFrameID()+' div.lgnd-container div.lgnd-scroll div.lgnd-template[data-index="'+
								tmpltIndex+'"] div.lgnd-group input.lgnd-entry-check').prop('checked', false);
			// Just select this one
		jQuery(getFrameID()+' div.lgnd-container div.lgnd-scroll div.lgnd-template[data-index="'+
								tmpltIndex+'"] div.lgnd-group div.lgnd-value[data-index="'+vIndex+
								'"] input.lgnd-entry-check').prop('checked', true);
		setLDirty(true);
	} // doFeatureSelectOnly()


		// PURPOSE: Handle click anywhere on Legend
	function clickInLegend(event)
	{
			// Which Template does selection belong to?
		var tmpltIndex = jQuery(event.target).closest('div.lgnd-template').data('index');
		var clickClass = event.target.className;
		switch (clickClass) {
		case 'lgnd-update':
			if (vizModel && datastream) {
				PState.set(PSTATE_BUILD);
				vizModel.render(datastream);
				computeSel();
				setLDirty(false);
				PState.set(PSTATE_READY);
			}
			break;
			// Turn on or off just this one value
		case 'lgnd-entry-check':
			var lEntry = jQuery(event.target).closest('div.lgnd-entry');
			var isChecked = jQuery(event.target).is(':checked');
				// What does checkbox belong to?
			if (lEntry.hasClass('lgnd-sh'))
				doShowHideAll(tmpltIndex, isChecked);
				// A locate Attribute?
			else if (lEntry.hasClass('lgnd-locate'))
				doLocateSelect(tmpltIndex, lEntry.data('id'), isChecked);
					// Must belong to a lgnd-entry
			else if (lEntry.hasClass('lgnd-value'))
				doFeatureSelect(tmpltIndex, lEntry.data('index'), isChecked);
			break;

			// Make this only selected feature attribute
		case 'lgnd-viz':
		case 'lgnd-value-title': 		// Title used for both locate and feature Attributes!
			var lEntry = jQuery(event.target).closest('div.lgnd-entry');
			if (lEntry.hasClass('lgnd-locate'))
				doLocateSelectOnly(tmpltIndex, lEntry.data('id'));
			else if (lEntry.hasClass('lgnd-value'))
				doFeatureSelectOnly(tmpltIndex, lEntry.data('index'));
			break;

		case 'lgnd-template':
		case 'lgnd-select':
		case '':
				// Ignore these
			break;

		default:  // could be multiple
				// Show/Hide title?
			if (clickClass.match(/lgnd-sh/i)) {
					// Simulate click
				var checkBox = jQuery(event.target).find('input.lgnd-entry-check');
				var isChecked = !checkBox.is(':checked');
				checkBox.prop('checked', isChecked);
				doShowHideAll(tmpltIndex, isChecked);
			}
			break;
		}
	} // clickInLegend()


		// PURPOSE: Handle selecting a feature Attribute for a Template from menu
	function selectTmpltAtt(event)
	{
			// Determine Template to which this refers
		var tmpltIndex = jQuery(event.target).closest('div.lgnd-template').data('index');
		var attID = jQuery(event.target).val();
		setLegendFeatures(tmpltIndex, attID);
		setLDirty(true);
	} // selectTmpltAtt()


		// PURPOSE: Set feature attributes in Legend
		// INPUT: 	lIndex = index of the Legend to change (0..numTemplates-1)
		//			attID = ID of feature Attribute in the Legend set
		// NOTES: 	Does not affect menu selection itself
	function setLegendFeatures(lIndex, attID)
	{
		var element;

		var group = jQuery(getFrameID()+' div.lgnd-container div.lgnd-scroll div.lgnd-template[data-index="'+
						lIndex+'"] div.lgnd-group');
			// Clear any previous entries
		group.empty();
		legendIDs[lIndex] = attID;
			// Insert new items
		var attDef = PData.aByID(attID);
			// Create pseudo-entry for undefined value
		if (typeof attDef.r.u !== 'undefined') {
			element = '<div class="lgnd-value lgnd-entry" data-index="-1"><input type="checkbox" checked="checked" class="lgnd-entry-check"/>'+
						'<div class="lgnd-viz" style="background-color: '+attDef.r.u.v+'"> </div> <span class="lgnd-value-title">'+dlText.undef+'</span></div>';
			group.append(element);
		}
		attDef.l.forEach(function(legEntry, lgIndex) {
			element = '<div class="lgnd-value lgnd-entry" data-index="'+lgIndex+'"><input type="checkbox" checked="checked" class="lgnd-entry-check"/>'+
						'<div class="lgnd-viz" style="background-color: '+legEntry.v+'"> </div> <span class="lgnd-value-title">'+legEntry.l+'</span></div>';
			group.append(element);
			if (legEntry.z && legEntry.z.length > 0) {
				legEntry.z.forEach(function(zEntry, zIndex) {
					element = '<div class="lgnd-value lgnd-entry" data-index="'+lgIndex+','+zIndex+
								'"><input type="checkbox" checked="checked" class="lgnd-entry-check"/>';
					if (zEntry.v && zEntry.v !== '') {
						element += '<div class="lgnd-viz" style="background-color: '+zEntry.v+'"></div>';
					} else {
						element += '<div class="lgnd-viz lgnd-viz-empty"></div>';
					}
					element += ' <span class="lgnd-value-title">&raquo; '+zEntry.l+'</span></div>';
					group.append(element);
				});
			}
		});
			// Turn on Show/Hide All by default
		jQuery(getFrameID()+' div.lgnd-container div.lgnd-scroll div.lgnd-template[data-index="'+
						lIndex+'"] div.lgnd-sh input').prop('checked', true);
	} // setLegendFeatures()


		// PURPOSE: Create appropriate VizModel within frame
		// INPUT: 	vIndex is index in Exhibit array
		//			if refresh, then immediately redraw
	function createViz(vIndex, refresh)
	{
		var theView = PData.vByN(vIndex);

			// Remove current viz content
		if (vizModel) {
			vizModel.teardown();
			vizModel = null;
		}
		var frame = jQuery(getFrameID());

		frame.find('div.viz-content div.viz-result').empty();

		var newViz;
		switch (theView.vf) {
		case 'M':
			newViz = new VizMap(instance, theView.c);
			break;
		case 'C':
			newViz = new VizCards(instance, theView.c);
			break;
		case 'P':
			newViz = new VizPinboard(instance, theView.c);
			break;
		case 'T':
			newViz = new VizTime(instance, theView.c);
			break;
		case 'D':
			newViz = new VizDirectory(instance, theView.c);
			break;
		case 't':
			newViz = new VizTextStream(instance, theView.c);
			break;
		case 'N':
			newViz = new VizNetWheel(instance, theView.c);
			break;
		// case 'S':
		// 	newViz = new VizStackChart(instance, theView.c);
		// 	break;
		// case 'F':
		// 	newViz = new VizFlow(instance, theView.c);
		// 	break;
		// case 'B':
		// 	newViz = new VizBrowser(instance, theView.c);
		// 	break;
		// case 'm':
		// 	newViz = new VizMBMap(instance, theView.c);
		// 	break;
		}
		vizSelIndex = vIndex;
		var flags = newViz.flags();

			// Either add scroll bars to viz-content and make viz-result fit content
			//	or else give max-size to viz-result
		if (flags & V_FLAG_HSCRL) {
			frame.find('div.viz-content').addClass('h-scroll');
			frame.find('div.viz-result').addClass('viz-fit-w');
			frame.find('div.viz-result').removeClass('viz-max-w');
		} else {
			frame.find('div.viz-content').removeClass('h-scroll');
			frame.find('div.viz-result').removeClass('viz-fit-w');
			frame.find('div.viz-result').addClass('viz-max-w');
		}
		if (flags & V_FLAG_VSCRL) {
			frame.find('div.viz-content').addClass('v-scroll');
			frame.find('div.viz-result').addClass('viz-fit-h');
			frame.find('div.viz-result').removeClass('viz-max-h');
		} else {
			frame.find('div.viz-content').removeClass('v-scroll');
			frame.find('div.viz-result').removeClass('viz-fit-h');
			frame.find('div.viz-result').addClass('viz-max-h');
		}

		legendIDs=[];

			// Does Viz support Legend at all?
		if (flags & V_FLAG_LGND) {
			frame.find('.hslgnd').button('enable');
				// Clear out previous Legend
				// remove all previous locate Attributes
			var lgndCntr = frame.find('div.lgnd-container div.lgnd-scroll');
			lgndCntr.empty();

				// Is it just a single Legend for all Records?
			if (flags & V_FLAG_SLGND) {
				var fAttID = newViz.getFeatureAtts();
				var fAtt = PData.aByID(fAttID);
				lgndCntr.append('<div class="lgnd-template" data-index="0"><div class="lgnd-title">'+fAtt.def.l+
					'</div><div class="lgnd-entry lgnd-sh"><input type="checkbox" checked="checked" class="lgnd-entry-check"/><i>'+
					dlText.sha+'</i></div><div class="lgnd-group"></div></div>');
					// Only a single Attribute available
				legendIDs.push(fAttID);
				setLegendFeatures(0, fAttID);
			} else {
					// Create Legend sections for each Template
				var prev=false;
				prspdata.e.g.ts.forEach(function(tID, tIndex) {
					var tmpltDef = PData.tByID(tID);
						// Insert locate attributes into Legends
					var locAtts = newViz.getLocAtts(tIndex);
					if ((locAtts && locAtts.length > 0) || !(flags & V_FLAG_LOC)) {
							// Create dropdown menu of visual feature Attributes
						var fAtts = newViz.getFeatureAtts(tIndex);
							// Don't show this Template at all if no feature Atts!
						if (fAtts.length > 0) {
							if (prev)
								lgndCntr.append('<hr/>');

								// Create DIV structure for Template's Legend entry
							var newTLegend = jQuery('<div class="lgnd-template" data-index="'+tIndex+
											'"><div class="lgnd-title">'+tmpltDef.l+'</div></div>');
							if (locAtts)
								locAtts.forEach(function(attID, aIndex) {
									var attDef = PData.aByID(attID);
									newTLegend.append('<div class="lgnd-entry lgnd-locate" data-id="'+attID+
										'"><input type="checkbox" checked="checked" class="lgnd-entry-check"/><span class="lgnd-value-title">'+
										attDef.def.l+'</span></div>');
								});
							var newStr = '<select class="lgnd-select">';
							fAtts.forEach(function(attID, aIndex) {
								var attDef = PData.aByID(attID);
								newStr += '<option value="'+attID+'">'+attDef.def.l+'</option>';
							});
							newStr += '</select>';
							var newSelect = jQuery(newStr);
							newSelect.change(selectTmpltAtt);
							jQuery(newTLegend).append(newSelect);
								// Create Hide/Show all checkbox
							jQuery(newTLegend).append('<div class="lgnd-entry lgnd-sh"><input type="checkbox" checked="checked" class="lgnd-entry-check"/><i>'+
								dlText.sha+'</i></div><div class="lgnd-group"></div>');
							lgndCntr.append(newTLegend);
								// Default feature selection is first Attribute
							var fAttID = fAtts[0];
							legendIDs.push(fAttID);
							setLegendFeatures(tIndex, fAttID);
							prev=true;
						}
					}
				});
			}
			frame.find('div.lgnd-container').show();
		} else {
			frame.find('button.hslgnd').button('disable');
				// Just hide Legend
			frame.find('div.lgnd-container').hide();
		}
			// As we initially render view, "Update" should be disabled
		setLDirty(false);

			// Enable or disable corresponding Highlight button & Save Reading checkboxes
		if (flags & V_FLAG_SEL) {
			frame.find('.hilite').button('enable');
			jQuery('#save-reading-h'+vfIndex).prop('disabled', false).prop('checked', false);
		} else {
			frame.find('.hilite').button('disable');
			jQuery('#save-reading-h'+vfIndex).prop('disabled', true).prop('checked', false);
		}

			// Does Viz have an Options dialog?
		if (flags & V_FLAG_OPT) {
			frame.find('.vopts').button('enable');
		} else {
			frame.find('.vopts').button('disable');
		}

			// Does Viz have annotation?
		var hint = newViz.hint();
		if (hint || typeof theView.n === 'string' && theView.n !== '')
		{
			frame.find('.vnote').button('enable');
			if (hint) {
				if (typeof theView.n === 'string' && theView.n !== '')
					hint += '.<br/>'+theView.n;
				else
					hint += '.';
			} else {
				hint = theView.n;
			}
			jQuery('#vnotes-txt').empty().append(hint);
		} else {
			frame.find('.vnote').button("disable");
		}

		newViz.setup();

			// ViewFrames initially created w/o selection
		// doSelBtns(false);

		if (datastream && refresh) {
			newViz.render(datastream);
		}
		vizModel = newViz;
	} // createViz()


	// INSTANCE METHODS
	//=================

	instance.getFrameID = getFrameID;

	instance.getIndex = function()
	{
		return vfIndex;
	}

	instance.setViz = function(vI, refresh)
	{
		if (vI != vizSelIndex) {
			var select = jQuery(getFrameID()+' div.view-controls select.view-viz-select');
			select.val(vI);
			createViz(vI, refresh);
		}
	} // setViz()

		// PURPOSE: Initialize basic DOM structure for ViewFrame
	instance.initDOM = function(vI)
	{
		var viewDOM = document.getElementById('dltext-view-controls').innerHTML;
		jQuery('#viz-frame').append('<div id="view-frame-'+vfIndex+'">'+viewDOM+'</div>');

		var frame = jQuery(getFrameID());

			// Localize color scheme?
		var clr = prspdata.bClrs.vf;
		if (clr && clr.length > 0)
			frame.find('div.view-controls').css('background-color', clr);

			// Activate drag handle on Legend
		frame.find('div.lgnd-container').draggable({ handle: frame.find('div.lgnd-handle'), containment: "parent" });

		var select = frame.find('div.view-controls select.view-viz-select');
			// Set Dropdown to View names
		prspdata.e.vf.forEach(function(theVF, i) {
			var optionStr = '<option value="'+i+'">'+theVF.l+'</option>';
			select.append(optionStr);
		});
		select.val(vI);
		select.change(selectChangeViz);

			// Hook control bar Icon buttons
		frame.find('div.view-controls button:first')
				.button({icons: { primary: 'ui-icon-bookmark' }, text: false })
				.click(clickShowHideLegend).next()
				.button({icons: { primary: 'ui-icon-wrench' }, text: false })
				.click(clickVizControls).next()
				.button({icons: { primary: 'ui-icon-info' }, text: false })
				.click(clickVizNotes).next()
				.button({icons: { primary: 'ui-icon-star' }, text: false })
				.click(clickHighlight).next()
				.button({icons: { primary: 'ui-icon-cancel' }, text: false })
				.click(clickClearSelection).next()
				.button({icons: { primary: 'ui-icon-search' }, text: false })
				.click(clickOpenSelection).next();

		frame.find('div.lgnd-container')
			.click(clickInLegend);

		createViz(vI, false);
	} // initDOM()


		// RETURNS: Array of currently selected locate Attribute IDs for tIndex
	instance.getSelLocAtts = function(tIndex)
	{
		var attIDs = [];
		var boxes = jQuery(getFrameID()+' div.lgnd-container div.lgnd-scroll div.lgnd-template[data-index="'+
							tIndex+'"] div.lgnd-locate input:checked');
		boxes.each(function() {
			var attID = jQuery(this).parent().data('id');
			attIDs.push(attID);
		});
		return attIDs;
	} // getSelLocAtts()


		// RETURNS: Array of indices of currently selected feature Attribute IDs for tIndex
		// NOTES: 	Indices are in dot notation for 2ndary-level (x.y)
		//			Array must be in numeric order
	instance.getSelFeatAtts = function(tIndex)
	{
		var attIndices = [], attIndex, i;
		var boxes = jQuery(getFrameID()+' div.lgnd-container div.lgnd-scroll div.lgnd-template[data-index="'+
							tIndex+'"] div.lgnd-group div.lgnd-value input:checked');
		boxes.each(function() {
			attIndex = jQuery(this).parent().data('index');
			if (typeof attIndex == 'number') {
				attIndices.push(attIndex);
			} else {
				if ((i=attIndex.indexOf(',')) != -1) {
					attIndices.push([parseInt(attIndex.substring(0,i),10), parseInt(attIndex.substring(i+1),10)]);
				} else
					attIndices.push(parseInt(attIndex,10));
			}
		});
		return attIndices;
	} // getSelFeatAtts()


		// RETURNS: Attribute ID selected on Legend for tIndex
	instance.getSelLegend = function(tIndex)
	{
		return legendIDs[tIndex];
	} // getSelLegend()

		// RETURNS: Array of Attribute IDs chosen for all Templates on Legend
	instance.getLgndSels = function()
	{
		return legendIDs.slice(0);
	} // getLgndSels()

		// PURPOSE: Set the Feature Attribute selections on the Legends
		// NOTES: 	Utility function for setting Reading
	instance.setLgndSels = function(attIDs)
	{
		attIDs.forEach(function(attID, i) {
				// IDs for Templates not shown can be null
			if (attID) {
				var select = jQuery(getFrameID()+' div.lgnd-container div.lgnd-scroll div.lgnd-template[data-index="'+i+'"] select.lgnd-select');
				select.val(attID);
				setLegendFeatures(i, attID);
			}
		});
	} // setLgndSels()

		// RETURNS: The state of the current visualization
	instance.getState = function()
	{
		return vizModel ? vizModel.getState() : null;
	} // getState()

		// PURPOSE: Set the state of the current visualization
	instance.setState = function(state)
	{
		if (vizModel) {
			vizModel.setState(state);
		}
	} // getState()

		// PURPOSE: Called by external agent when new datastream is available for viewing
	instance.showStream = function(stream)
	{
		datastream = stream;
		if (vizModel) {
			vizModel.render(stream);
		}
		setLDirty(false);
	} // showStream()

	instance.setStream = function(stream)
	{
		datastream = stream;
	} // setStream()

		// PURPOSE: Either enable or disable selection buttons for this ViewFrame
	instance.selBtns = function(enable)
	{
		doSelBtns(enable);
	} // selBtns()

	instance.clearSel = function()
	{
		selAbsIs = vizSel = [];
		doSelBtns(false);
		if (vizModel) {
			vizModel.clearSel();
		}
	} // clearSel()

		// PURPOSE: Attempt to set the Selection List of the VizModel to selList
		// RETURNS: true if possible, false if not
	instance.setSel = function(selList)
	{
		selAbsIs = selList;
		if (vizModel) {
			if (vizModel.flags() & V_FLAG_SEL) {
				vizModel.setSel(selList);
				computeSel();
				// doSelBtns(selList.length > 0);
				return true;
			}
			return false;
		}
		return false;
	} // selSel()

		// PURPOSE: Alert inner visualization that view frame has resized
	instance.resize = function()
	{
		if (vizModel) {
			vizModel.resize();
		}
	} // resize()

	instance.title = function()
	{
		var v = PData.vByN(vizSelIndex);
		return v.l;
	} // title()

	instance.flushLgnd = function()
	{
		var frame = jQuery(getFrameID());
		frame.find('div.lgnd-container').css('left', '10px');
	} // flushLgnd()

		// PURPOSE: Return the Record bitmap data for this view
	instance.getBMData = function()
	{
		if (vizModel) {
			return { t: vizModel.tUsed, r: vizModel.rMap };
		}
		return null;
	} // getBMData()

	return instance;
} // PViewFrame


// Immediately Invoked Function Expression -- Bootstrap for Prospect Volume Client
// PURPOSE: Create DOM structure, initiate services, manage filters, …

// USES: 	jQuery, jQueryUI, view-core
// ASSUMES: prspdata is fully loaded


jQuery(document).ready(function($) {

		// VARIABLES
		//==========
	var views = [null, null];	// 2 possible viewFrames

	var hFilters=[null, null];	// Highlight Filter
	var hFilterIDs=[null, null]; // Highlight Filter Attribute IDs

	var annote;					// Annotation from current Reading

	var topStream;				// Top-level IndexStream (before Filters)
	var endStream;				// Final resulting IndexStream (after Filters)

	var localStore=null;		// Local (Browser) storage (if Browser capable)
	var localReadings=[];		// locally-stored Readings

		// Volume extensions (not in Exhibit)
	var vMode='v0';				// view option: selection from selaction radio buttons: 'v0', 'v1' or 'v2'
	var tocVis = false;			// Frame 0 has TOC (true) or Text (false)
	var volData=[];				// Indices into text stream where chapters and sections begin: { hi, hl, bi, bl }
								//		header and body x index and length (chars)
	var tocRL=[];				// Which chapters and sections on reading list
	var tocSel=[];				// Which chapters and sections are highlighted for reading
	var tocSelDirty=false;		// Has user changed TOC selection?
	var txtIDs=[];				// IDs of all Records currently in text frame (in sorted order)
	var txtIS;					// IndexStream of Records in links in text frame
	var selIDs=[];				// Record IDs selected by user from text (in sorted order)
	var selIS;					// IndexStream of Records selected by user
	var selAbsI;				// Array of absolute indices of Records selected by user


		// FUNCTIONS
		//==========

	function doRecompute()
	{
		var fDiv;

		PState.set(PSTATE_PROCESS);

		if (topStream == null)
			topStream = PData.sNew(true);
		endStream = topStream;

		PState.set(PSTATE_BUILD);
		paint();
	} // doRecompute()

		// PURPOSE: Set annotation text to <t>
	function setAnnote(t)
	{
		annote = t;

		var n = jQuery('#annote');
		n.text(t);

		if (t.length > 0) {
			jQuery('#btn-annote').button("enable");
			n.show();
		} else {
			jQuery('#btn-annote').button("disable");
			n.hide();
		}
	} // setAnnote()

		// PURPOSE: Hide/show the annotation for this View Frame
	function clickAnnotation(event)
	{
		jQuery('#annote').toggle('slide', { direction: "right" });
		event.preventDefault();
	} // clickAnnotation()

	function clickAbout(event)
	{
		var aboutDialog;

		jQuery("#dialog-about img").removeClass("zoomin");
		aboutDialog = jQuery("#dialog-about").dialog({
			height: 390,
			width: 350,
			modal: true,
			buttons: [{
				text: dlText.ok,
				click: function() {
					aboutDialog.dialog("close");
				}
			}]
		});
		jQuery("#dialog-about img").addClass("zoomin");

		event.preventDefault();
	} // clickAbout()

		// RETURNS: Record for ID or else null
	function getReading(id)
	{
			// Check Readings from server
		var reading = _.find(prspdata.p, function(theP) {
			return id == theP.id;
		});
		if (reading)
			return reading;

		if (localStore == null || localReadings.length == 0)
			return null;

		reading = _.find(localReadings, function(theP) {
			return id == theP.id;
		});
		if (reading)
			return reading;

		return null;
	} // getReading()

		// PURPOSE: Save current Reading as <id>
		// RETURNS: "local" or "server" if save successful, else null
	function doSaveReading(id, label)
	{
			// Where to save it?
		var dest = jQuery('input[name=save-reading-dest]:checked').val();
		if (dest == '')
			return null;

		var note = jQuery('#save-reading-note').val();
		note = note.replace(/"/g, '');

			// Compile Reading state
		var pState = { f: [], h0: null, h1: null, v0: null, v1: null };
		views.forEach(function(v, vI) {
			if (v) {
				pState['v'+vI] = { l: v.title(), s: v.getState() }
			}
		});
		filters.forEach(function(theF) {
			var a=[];
			var fDiv = jQuery('div.filter-instance[data-id="'+theF.id+'"]');
			for (var ti=0; ti<PData.eTNum(); ti++) {
				a.push(fDiv.find('.apply-tmplt-'+ti).is(':checked'));
			}
			pState.f.push({ id: theF.attID, a: a, s: theF.f.getState() });
		});

			// Save Highlight filters?
		for (var h=0; h<2; h++) {
			var hFilter = hFilters[h];
			if (hFilter !== null && jQuery('#save-reading-h'+h).is(':checked')) {
				pState['h'+h] = { id: hFilterIDs[h], s: hFilter.getState() };
			}
		}
			// Store everything in Reading object
		var sReading = { id: id, l: label, n: note, s: pState };

		if (dest == 'local') {
			localReadings.push(Reading);
			localStore.setItem(prspdata.e.id, JSON.stringify(localReadings));
		} else if (dest == 'server') {
				// Send via AJAX -- if successful, add locally
			jQuery.ajax({
				type: 'POST',
				url: prspdata.ajax_url,
				data: {
					action: 'prsp_save_reading',
					id: id,
					l: label,
					x: prspdata.e.id,
					n: note,
					s: JSON.stringify(pState)
				},
				success: function(data, textStatus, XMLHttpRequest)
				{
					if (data != '0')
						prspdata.p.push(sReading);
				},
				error: function(XMLHttpRequest, textStatus, errorThrown)
				{
				   alert(errorThrown);
				}
			});
		}
		return dest;
	} // doSaveReading()

	function clickSaveReading(event)
	{
		var spDialog;
		var idExp = /[^\w\-]/;

			// Clear any previous input values
		jQuery('#save-reading-id').val('');
		jQuery('#save-reading-lbl').val('');
		jQuery('#save-reading-note').val('');

			// Make sure Browser has local storage capability
		if (!localStore) {
			jQuery('#save-reading-d-1').prop('disabled', true);
		}
			// If user not logged in, disable server capability
		if (!prspdata.x.add_reading) {
			jQuery('#save-reading-d-2').prop('disabled', true);
		}

			// Uncheck Highlight filters by default
		jQuery('#save-reading-h0').prop('checked', false);
		jQuery('#save-reading-h1').prop('checked', false);
			// Dis-/enable if no filter
		for (var h=0; h<2; h++) {
			var disable = (hFilters[h] === null || views[h] === null);
			jQuery('#save-reading-h'+h).prop('disabled', disable);
		}

		spDialog = jQuery("#dialog-save-reading").dialog({
			width: 350,
			height: 370,
			modal: true,
			buttons: [
				{
					text: dlText.ok,
					click: function() {
						var id = jQuery('#save-reading-id').val().trim();
							// Make sure ID correct format
						var idError = id.match(idExp);
						var label = jQuery('#save-reading-lbl').val().trim();
						label = label.replace(/"/g, '');

						if (id.length === 0 || id.length > 20 || idError)
							idError = '#dialog-reading-id-badchars';
							// Make sure ID not already taken
						else if (getReading(id))
							idError = '#dialog-reading-id-used';
						else if (label.length === 0 || label.length > 32)
							idError = '#dialog-reading-label-bad';
						if (idError) {
							var errDialog = jQuery(idError).dialog({
								width: 320,
								height: 210,
								modal: true,
								buttons: [{
									text: dlText.ok,
									click: function() {
										errDialog.dialog("close");
									}
								}]
							});
						} else {
							var saved = doSaveReading(id, label);
							spDialog.dialog("close");

							if (saved == 'server') {
									// Calculate Embed value
								var embed = volURL + '/?reading=' + id;

								jQuery('#save-reading-embed').val(embed);
								var embedDialog = jQuery("#dialog-reading-url").dialog({
									width: 480,
									height: 230,
									modal: true,
									buttons: [{
										text: dlText.ok,
										click: function() {
											embedDialog.dialog("close");
										}
									}]
								});
							} // saved on server
						} // no redundancy
					} // OK
				},
				{
					text: dlText.cancel,
					click: function() {
						spDialog.dialog("close");
					}
				}
			]
		});
		event.preventDefault();
	} // clickSaveReading()

	function manageReadings()
	{
		var mpDialog;
		var xData=[];
		var xDataDirty=false;

		function createList()
		{
				// Clear scroll areas and recreate
			var pList = jQuery('#reading-mlist');
			pList.empty();

				// Populate local list
			localReadings.forEach(function(theP) {
				pList.append('<li data-type="l" data-id="'+theP.id+'"><span class="label">'+theP.l+'</span> <button class="del">'+dlText.del+
					'</button> <button class="edit">'+dlText.edit+'</button></li>');
			});

				// Get other Readings/Perspectives of other Volumes/Exhibits (on this domain)
			for (var i=0; i<localStore.length; i++) {
				var xKey = localStore.key(i);
				if (xKey != prspdata.e.id) {
					var xItem = localStore.getItem(xKey);
					xData.push({ id: xKey, ps: JSON.parse(xItem) });
				}
			}

			xData.forEach(function(xEl, xI) {
				xEl.ps.forEach(function(pEl) {
					pList.append('<li data-type="x" data-xid="'+xEl.id+'" data-xindex="'+xI+'" data-id="'+
						pEl.id+'"><i class="label">'+pEl.l+'</i> <button class="del">'+dlText.del+
						'</button> <button class="edit">'+dlText.edit+'</button></li>');
				});
			});
		} // createList()

		createList();

			// Handle selection of item on Manage Readings list
		jQuery('#reading-mlist').click(function(event) {
			if (event.target.nodeName == 'BUTTON') {	// Edit or Delete?
				var del = jQuery(event.target).hasClass('del');
				var parent = jQuery(event.target).parent();
				var t = parent.data('type');
				var id = parent.data('id');
				var pI;
				if (del) {
					switch (t) {
					case 'l':
						pI = localReadings.findIndex(function(theP) {
							return id == theP.id;
						});
						if (pI != -1) {
							localReadings.splice(pI, 1);
							if (localReadings.length == 0)
								localStore.removeItem(prspdata.e.id);
							else
								localStore.setItem(prspdata.e.id, JSON.stringify(localReadings));
						}
						break;
					case 'x':
						var xI = parent.data('xindex');
						var xEntry = xData[xI];
						pI = xEntry.ps.findIndex(function(theP) {
							return id == theP.id;
						});
						if (pI != -1) {
							xEntry.ps.splice(pI, 1);
							xDataDirty = true;
						}
						break;
					} // switch type
					parent.remove();
				} else {
					var pRec;

					switch (t) {
					case 'l':
						pRec = _.find(localReadings, function(theP) {
							return id == theP.id;
						});
						break;
					case 'x':
						var xI = parent.data('xindex');
						var xEntry = xData[xI];
						pRec = _.find(xEntry.ps, function(theP) {
							return id == theP.id;
						});
						break;
					} // switch
					jQuery('#edit-reading-lbl').val(pRec.l);
					jQuery('#edit-reading-note').val(pRec.n);

					var epDialog = jQuery("#dialog-edit-prsrctv").dialog({
						width: 340,
						height: 270,
						modal: true,
						buttons: [
							{
								text: dlText.ok,
								click: function() {
									pRec.l = jQuery('#edit-reading-lbl').val();
									pRec.n = jQuery('#edit-reading-note').val();
									parent.find('.label').text(pRec.l);
									if (t == 'x')
										xDataDirty = true;
									else
										localStore.setItem(prspdata.e.id, JSON.stringify(localReadings));
									epDialog.dialog("close");
								}
							}, // OK
							{
								text: dlText.cancel,
								click: function() {
									epDialog.dialog("close");
								}
							}]});
				} // else edit
			} // if BUTTON
		});

		mpDialog = jQuery("#dialog-manage-reading").dialog({
			width: 450,
			height: 350,
			modal: true,
			buttons: [{
					text: dlText.ok,
					click: function() {
						if (xDataDirty) {
							xData.forEach(function(xEntry) {
								if (xEntry.ps.length > 0)
									localStore.setItem(xEntry.id, JSON.stringify(xEntry.ps));
								else
									localStore.removeItem(xEntry.id);
							});
						}
						jQuery('#reading-mlist').off("click");
						mpDialog.dialog("close");
					} // OK
				}]
		});
	} // manageReadings()

	function clickShowReading(event)
	{
			// Clear scroll areas and recreate
		var pList = jQuery('#reading-slist');
		pList.empty();

			// Populate server list
		prspdata.p.forEach(function(theP) {
			pList.append('<li data-src="server" data-id="'+theP.id+'">'+theP.l+'</li>');
		});

			// Populate local list
		localReadings.forEach(function(theP) {
			pList.append('<li data-src="local" data-id="'+theP.id+'">'+theP.l+'</li>');
		});

		var bs = [{
					text: dlText.ok,
					click: function() {
						spDialog.dialog("close");
						var selItem = pList.find('li.selected');
						if (selItem.length) {
							var setP = selItem.data('id');
							doShowReading(setP);
							PState.set(PSTATE_READY);
						}
					} // OK
				},
				{
					text: dlText.cancel,
					click: function() {
						spDialog.dialog("close");
					}
				}];
		if (localStore) {
			bs.push({text: dlText.manage,
					click: function() {
						spDialog.dialog("close");
						manageReadings();
					}});
		}

		var spDialog = jQuery("#dialog-show-reading").dialog({
			width: 350,
			height: 350,
			modal: true,
			buttons: bs
		});
		event.preventDefault();
	} // clickShowReading()

	function clickGoHome(event)
	{
		window.location.href=prspdata.e.g.hurl;
		event.preventDefault();
	} // clickGoHome()

		// PURPOSE: Add a new filter to the stack
		// INPUT: 	fID = Attribute ID
		//			apply = initial state of apply array (boolean for each Template)
		//			highlight = null if in Filter stack, else 0 or 1 (to indicate view applied to)
		// RETURNS: The Filter object created
		// NOTES:   IDs 0 and 1 are specially allocated to Highlight those respective views
		// ASSUMED: Remove filter won't be created for Highlight condition
	function createFilter(fID, apply, highlight)
	{
		var newID;
		var newFilter;
		var theAtt;
		var insert;

		newID = highlight;

		if (fID == '_remove') {
			newFilter = new PFilterRemove(newID);
			theAtt = { t: [true, true, true, true ] };	// Create pseudo-Attribute entry
		} else {
			theAtt = PData.aByID(fID);
			switch (theAtt.def.t) {
			case 'V':
				newFilter = new PFilterVocab(newID, theAtt);
				break;
			case 'T':
				newFilter = new PFilterText(newID, theAtt);
				break;
			case 'g':
				newFilter = new PFilterTags(newID, theAtt);
				break;
			case 'N':
				newFilter = new PFilterNum(newID, theAtt);
				break;
			case 'D':
				newFilter = new PFilterDates(newID, theAtt);
				break;
			}
		}

		insert = jQuery('#dialog-hilite-'+highlight+' span.filter-id').html(theAtt.def.l);
		insert = jQuery('#hilite-'+highlight);
		insert.empty();

			// Allow Filter to insert required HTML
		newFilter.setup();
		return newFilter;
	} // createFilter()

		// PURPOSE: Allow user to choose an Attribute from a list
		// INPUT: 	if showRemove, then show the "Remove All" pseudo-Filter
		//			if secondary, this dialog must appear on top of another
		//			usedTs is either null (show all Attributes) or is array of flags for each Template
		//				(Attribute must belong to one to appear)
		//			if Attribute is chosen, pass selection on to callback function
		// NOTES: 	Since this dialog can be invoked from two other modal dialogs, need
		//				to append at particular point in DOM to ensure stacked properly
	function chooseAttribute(showRemove, secondary, usedTs, callback)
	{
			// Clear previous selection
		jQuery("#filter-list li").removeClass("selected");
			// Hide or Show Attributes
		var attList = jQuery("#filter-list li");
		var li, attID, attDef, on;
		attList.each(function(i) {
			li = jQuery(this);
			attID = li.data("id");
			if (attID == '_remove') {
					// Do we show "Remove" Filter Option?
				if (showRemove) {
					li.show();
				} else {
					li.hide();
				}
			} else {
				if (usedTs) {
					attDef = PData.aByID(attID);
						// Only show an Attribute if it appears in a Template that was rendered in the view
					on = false;
					attDef.t.forEach(function(u, uI) {
						on = on || (u && usedTs[uI]);
					});
					if (on)
						li.show();
					else
						li.hide();
				} else {
					li.show();
				}
			}
		});

		var attDialog;

		var dialogParams = {
			height: 300,
			width: 350,
			modal: true,
			buttons: [
				{
					text: dlText.add,
					click: function() {
						var selected = jQuery("#filter-list li.selected");
						if (selected.length === 1) {
							callback(selected.data("id"));
						}
							// Remove click handler
						attDialog.dialog("close");
					}
				},
				{
					text: dlText.cancel,
					click: function() {
							// Remove click handler
						attDialog.dialog("close");
					}
				}
			]
		};
		if (secondary) {
			dialogParams.appendTo = '#dialog-2';
		}

		attDialog = jQuery("#dialog-choose-att").dialog(dialogParams);
	} // chooseAttribute()

		// PURPOSE: Apply effect of a Highlight filter
	function doApplyHighlight(vI)
	{
		var hFilter=hFilters[vI];
		var vf = views[1];
		var relI=0, absI, rec;
		var tI=0, tRec;

		PState.set(PSTATE_PROCESS);

			// Apply to Text Frame?
		if (vI === 0) {
			selIDs=[]; selIS=null; selAbsI=[];
			jQuery('#text-frame a').removeClass('sel');

			if (txtIS == null) {
				txtIDs2IS();
			}
			hFilter.evalPrep();

			tRec=txtIS.t[0];
				// Must keep absolute indices and template params updated!
			outer:
			while (relI < txtIS.l) {
					// Advance until we get to current Template rec
				while (tRec.n == 0 || (tRec.i+tRec.n) == relI) {
						// Fast-forward to next used template set
					if (++tI === PData.eTNum()) {
						break outer;
					}
					tRec = txtIS.t[tI];
					relI = tRec.i;
				}
				absI = txtIS.s[relI++];
				rec = PData.rByN(absI);
				if (hFilter.eval(rec)) {
					selIDs.push(rec.id);
					selAbsI.push(absI);
				}
			}
			hFilter.evalDone(txtIS.l);
			selIDs.sort();
			selIDs.forEach(function(theID) {
				jQuery('#text-frame a[data-id="'+theID+'"]').addClass('sel');
			});
			PState.set(PSTATE_UPDATE);
			switch (vMode) {
			case 'v0': 		// Show all Records, highlight selected
			case 'v1': 		// Show Records visible from Text, highlight selected
				if (selAbsI.length > 0) {
					vf.setSel(selAbsI);
				} else {
					vf.clearSel();
				}
				break;
			case 'v2': 		// Only Show selected Records
				selIDs2IS();
				vf.showStream(selIS);
				break;
			}

		} else {	// Apply to Viz Frame
			var bm = vf.getBMData();
			var list=[];

			if (endStream != null) {
				hFilter.evalPrep();

				tRec=endStream.t[0];
					// Must keep absolute indices and template params updated!
				outer:
				while (relI < endStream.l) {
						// Advance until we get to current Template rec
					while (!bm.t[tI] || tRec.n == 0 || (tRec.i+tRec.n) == relI) {
							// Fast-forward to next used template set
						if (++tI === PData.eTNum()) {
							break outer;
						}
						tRec = endStream.t[tI];
						relI = tRec.i;
					}
					absI = endStream.s[relI++];
						// Check bitflag if Record rendered
					if (bm.r[absI >> 4] & (1 << (absI & 15))) {
						rec = PData.rByN(absI);
						if (hFilter.eval(rec)) {
							list.push(absI);
						}
					}
				}
				hFilter.evalDone(endStream.l);
			}
			PState.set(PSTATE_UPDATE);
			if (list.length > 0) {
				vf.setSel(list);
			} else {
				vf.clearSel();
			}
		}

		PState.set(PSTATE_READY);
	} // doApplyHighlight()

		// PURPOSE: Handle click on "Highlight" button
		// INPUT: 	vI = index of view frame
		//			tUsed = null (allow all Attributes) or array of booleans corresponding to Templates
	function clickHighlight(vI, tUsed)
	{
		var dialog;

		dialog = jQuery("#dialog-hilite-"+vI).dialog({
			height: 275,
			width: Math.min(jQuery(window).width() - 20, 675),
			modal: true,
			appendTo: "#dialog-1",
			buttons: [
				{
					text: dlText.chsatt,
					click: function() {
						chooseAttribute(false, true, tUsed, function(id) {
							hFilterIDs[vI] = id;
							hFilters[vI] = createFilter(id, null, vI);
						});
					}
				},
				{
					text: dlText.ok,
					click: function() {
						dialog.dialog("close");
						if (hFilters[vI] !== null) {
							doApplyHighlight(vI);
						}
					}
				},
				{
					text: dlText.cancel,
					click: function() {
						dialog.dialog("close");
					}
				}
			]
		});
	} // clickHighlight()


		// PURPOSE: Attempt to show Reading pID
		// RETURN:  false if error
	function doShowReading(pID)
	{
		function vizIndex(vID)
		{
			return prspdata.e.vf.findIndex(function(vf) {
				return vID == vf.l;
			});
		}

		var p = getReading(pID);
		if (p == null)
			return false;

		PState.set(PSTATE_PROCESS);

			// Minimize filter and selector bars
		jQuery('#filter-frame').hide();

			// Clear current Filter Stack & Selector Filter
		filters.forEach(function(theF) {
			theF.f.teardown();
		});
		filters=[];
		jQuery('#filter-instances').empty();

		p.s.f.forEach(function(fRec) {
			var newF = createFilter(fRec.id, fRec.a, null);
			newF.setState(fRec.s);
		});
		jQuery('#filter-instances').hide();
		jQuery('#btn-toggle-filters').button(p.s.f.length == 0 ? "disable" : "enable");

			// Load Highlight filters?
		for (var h=0; h<2; h++) {
			if (p.s['h'+h] != null) {	// Want to check for both null and undefined!
				var hFData = p.s['h'+h];
				hFilterIDs[h] = hFData.id;
				var hFilter = createFilter(hFData.id, null, h);
				hFilters[h] = hFilter;
				hFilter.setState(hFData.s);
			} else {
				hFilters[h] = null;
				hFilterIDs[h] = null;
			}
		}

		var vI, v0=views[0], v1=views[1];
		var resize0=false;

		PState.set(PSTATE_BUILD);
		vI = vizIndex(p.s.v0.l);
			// Already exists?
		if (v0) {
			v0.setViz(vI, false);
			v0.selBtns(false);
		} else {
			views[0] = PViewFrame(0);
			v0 = views[0];
			v0.initDOM(vI);
		}

		if (p.s.v1 !== null) {
			vI = vizIndex(p.s.v1.l);
				// Already exists?
			if (v1) {
				v1.selBtns(false);
				v1.setViz(vI, false);
				v1.setState(p.s.v1.s);
			} else {
				v0.flushLgnd();
				views[1] = PViewFrame(1);
				v1 = views[1];
				v1.initDOM(vI);
				v1.setState(p.s.v1.s);
				resize0 = true;
			}
		} else {
			if (v1) {
				views[1] = null;
				jQuery('#view-frame-1').remove();
				resize0 = true;
			}
		}
			// Do left-side last because of resizing with right side
		if (resize0)
			v0.resize();
		v0.setState(p.s.v0.s);

		setAnnote(p.n);

			// Don't recompute if data not loaded yet
		if (PData.ready() && topStream) {
			doRecompute();
			for (h=0; h<2; h++) {
				if (hFilterIDs[h] !== null) {
					doApplyHighlight(h);
				}
			}
		}

		return true;
	} // doShowReading()


		// VOLUME EXTENSIONS
		//==================

		// PURPOSE: Draw visualization in views[1] based on vMode setting
	function paint()
	{
		var v=views[1];
		if (v) {
			switch (vMode) {
			case 'v0': 		// Show all Records, highlight selected
				v.showStream(endStream);
				if (selAbsI == null) {
					selIDs2AbsI();
				}
				if (selAbsI.length > 0) {
					v.setSel(selAbsI);
				} else {
					v.clearSel();
				}
				break;
			case 'v1': 		// Show Records visible from Text, highlight selected
				if (txtIS == null) {
					txtIDs2IS();
				}
				v.showStream(txtIS);
				if (selAbsI == null) {
					selIDs2AbsI();
				}
				if (selAbsI.length > 0) {
					v.setSel(selAbsI);
				} else {
					v.clearSel();
				}
				break;
			case 'v2': 		// Only Show selected Records
				v.clearSel();
				if (selIS == null) {
					selIDs2IS();
				}
				v.showStream(selIS);
				break;
			}
		}
	} // paint()


		// PURPOSE: Convert the Record IDs in txtIDs to IndexStream
	function txtIDs2IS()
	{
			// NOTE: Need as splice method, use generic arrays (not Uint16Array)
		txtIS = { s: [], t: [], l: 0 };
		var a, i, n, t;
			// Create empty slots for each Template
		for (i=0, n=PData.eTNum(); i<n; i++) {
			txtIS.t.push({i: 0, n: 0});
		}
		txtIDs.forEach(function(id) {
				// Convert to absolute index
			a = PData.nByID(id);
			if (a != null) {
					// Insert absI in order
				if (txtIS.s.length === 0) {
					txtIS.s.push(a);
				} else {
					i = _.sortedIndex(txtIS.s, a);
					txtIS.s.splice(i, 0, a);
				}
					// Which Template does it belong to?
				t=PData.n2T(a);
					// Increment # Recs for this Template and starting indices for rest
				txtIS.t[t++].n += 1;
				while (t < n) {
					txtIS.t[t++].i += 1;
				}
				txtIS.l += 1;
			}
		});
	} // txtIDs2Abs()

		// PURPOSE: Convert the Record IDs in selIDs to IndexStream
	function selIDs2IS()
	{
			// NOTE: Need as splice method, use generic arrays (not Uint16Array)
		selIS = { s: [], t: [], l: 0 };
		var a, i, n, t;
			// Create empty slots for each Template
		for (i=0, n=PData.eTNum(); i<n; i++) {
			selIS.t.push({i: 0, n: 0});
		}
		selIDs.forEach(function(id) {
				// Convert to absolute index
			a = PData.nByID(id);
			if (a != null) {
					// Insert absI in order
				if (selIS.s.length === 0) {
					selIS.s.push(a);
				} else {
					i = _.sortedIndex(selIS.s, a);
					selIS.s.splice(i, 0, a);
				}
					// Which Template does it belong to?
				t=PData.n2T(a);
					// Increment # Recs for this Template and starting indices for rest
				selIS.t[t++].n += 1;
				while (t < n) {
					selIS.t[t++].i += 1;
				}
				selIS.l += 1;
			}
		});
	} // txtIDs2Abs()

		// PURPOSE: Convert the Record IDs in selIDs to array of absIs
	function selIDs2AbsI()
	{
		selAbsI = [];
		var a, i;
		selIDs.forEach(function(id) {
				// Convert to absolute index
			a = PData.nByID(id);
				// Insert absI in order
			if (selAbsI.length === 0) {
				selAbsI.push(a);
			} else {
				i = _.sortedIndex(selAbsI, a);
				selAbsI.splice(i, 0, a);
			}
		});
	} // selIDs2AbsI()


	function buildTOC()
	{
		var volC, volS;
		var txt = document.getElementById('prsp-volume').innerHTML;
		var str;

		var tf = jQuery('#toc-frame > ul.toc-wrapper');
		tf.empty();

		volData.forEach(function(chap, cI) {
			str = '<li class="toc-chap" data-c='+cI+'><input type="checkbox" class="readlist-c"/> <button class="toccollapse">Collapse</button> ';
			str += chap.e.innerHTML;
			str += '<ul class="toc-secs">';
				// Section headers and following DOM elements up to H1 or H2
			chap.s.forEach(function(sec, sI) {
				str += '<li data-s='+sI+'><input type="checkbox" class="readlist"/>'+sec.innerHTML+'</li>';
			});
			str += '</ul></li>';
			tf.append(str);
		});

			// Bind click on chapters first
		jQuery('#toc-frame > ul.toc-wrapper > li.toc-chap').click(clickTOCChap);
			// Then bind clickk on sections
		jQuery('#toc-frame > ul.toc-wrapper > li.toc-chap > ul.toc-secs li').click(clickTOCSec);
			// Bind all RL checkbox clicks
		jQuery('#toc-frame > ul.toc-wrapper > li.toc-chap input[type=checkbox]').click(clickRLCheck);
			// Bind collapse/expand icon buttons
		jQuery('#toc-frame .toccollapse').button({icons: { primary: 'ui-icon-plus' }, text: false })
			.click(clickTOCCollapse);
	} // buildTOC()

		// PURPOSE: Insert appropriate text into text frame, given tocSel
		// SIDE-FX:	Compile list of Record IDs in <a> in txtIDs
		// TO DO:	Disable prev/next buttons if no RL items before or after
	function buildTextFrame()
	{
		var volC, volS, cur;
		// var txt = document.getElementById('prsp-volume').innerHTML;

		var tf = jQuery('#text-frame');
		tf.empty();

		tocSel.forEach(function(chap, cI) {
			volC = volData[cI];

				// Chapter header and following DOM elements up to H1 or H2
			if (chap.c) {
				tf.append(jQuery(volC.e).clone());
				cur = jQuery(volC.e).next();
				while (cur.length != 0) {
					switch (cur.prop('tagName').toUpperCase()) {
					case 'H1':
					case 'H2':
						cur=[];
						break;
					default:
						tf.append(cur.clone());
						cur = cur.next();
						break;
					} // switch
				} // while
			} // if
				// Section headers and following DOM elements up to H1 or H2
			chap.s.forEach(function(sec, sI) {
				if (sec) {
					volS = volC.s[sI];
					tf.append(jQuery(volS).clone());
					cur = jQuery(volS).next();
					while (cur.length != 0) {
						switch (cur.prop('tagName').toUpperCase()) {
						case 'H1':
						case 'H2':
							cur=[];
							break;
						default:
							tf.append(cur.clone());
							cur = cur.next();
							break;
						} // switch
					} // while
				} // if
			});
		});

			// Find all <a>, create list of recs from data-id
		txtIDs=[]; txtIS=null;
		selIDs=[]; selIS=null; selAbsI=null;
		var recs;
		recs = jQuery('#text-frame').find('a');
		recs.each(function(aI) {
			var thisID = jQuery(this).data('id');
				// Keep list sorted; don't add if already exists
			if (thisID) {
				if (txtIDs.length == 0) {
					txtIDs.push(thisID);
				} else {
					var i = _.sortedIndex(txtIDs, thisID);
					if (txtIDs[i] !== thisID) {
						txtIDs.splice(i, 0, thisID);
					}
				}
			}
		});
// console.log("Rec IDs on this page: "+JSON.stringify(txtIDs));
	} // buildTextFrame()


		// PURPOSE: Create all volume data by parsing HTML text representing volume
		// SIDE-FX: Creates volData, tocRL, tocSel
		// NOTES: 	Reading List is all on by default; open with first chapter in text pane
	function parseVol()
	{
			// Get first child DOM node
		var cur = jQuery('#prsp-volume').children(':first');
		var chap=null, sec=null;

		while (cur.length != 0) {
			switch (cur.prop('tagName').toUpperCase()) {
			case 'H1':
				if (chap != null) {
					volData.push(chap);
				}
				chap = { e: cur.get(0), s: [] };
				break;
			case 'H2':
				if (chap != null) {
					chap.s.push(cur.get(0));
				}
				break;
			default:
				break;
			}
			cur = cur.next();
		}
			// Save any remaining data
		if (chap != null) {
			volData.push(chap);
		}

			// Create default Reading List and Selection: everything selected on RL
		volData.forEach(function(chap) {
			var rlChap={c: true, s: []};
			var rlSel={c: false, s:[]};
			chap.s.forEach(function(sec) {
				rlChap.s.push(true);
				rlSel.s.push(false);
			});
			tocRL.push(rlChap);
			tocSel.push(rlSel);
		});

			// Open at very beginning by default
		tocSel[0].c = true;
	} // parseVol()

		// PURPOSE: Set tocSel to indicate viewing chap, sec and update everything
		// INPUT: 	if clear, remove all other flags
		//			cI (chapter index) = 0..n-1
		//			sI (section index) = 0..n-1 or -1 if none
	function setTOCSel(clear, cI, sI)
	{
		var chap;
		if (clear) {
			for (var i=0; i<tocSel.length; i++) {
				chap = tocSel[i];
				chap.c = false;
				for (var j=0; j<chap.s.length; j++)
					chap.s[j] = false;
			}
		}

		chap = tocSel[cI];
			// Now set new reading material
		if (sI == -1) {
			chap.c = true;
		} else {
			chap.s[sI] = true;
		}

		updateTOCSel();
		buildTextFrame();
		paint();
	} // setTOCSel()

		// PURPOSE: Set chapter & section selection based on tocSel
	function updateTOCSel()
	{
		var tf, cDom, sDom;

		tf = jQuery('#toc-frame');
		tocSel.forEach(function(chap, cI) {
			cDom = tf.find('ul.toc-wrapper > li.toc-chap[data-c="'+cI+'"]');
			cDom.toggleClass('sel', chap.c);
			chap.s.forEach(function(sec, sI) {
				cDom.find('li[data-s="'+sI+'"]').toggleClass('sel', sec);
			});
		});
	} // updateTOCRL()

		// PURPOSE: Set reading list checkboxes based on tocRL
	function updateTOCRL()
	{
		var tf, cDom, sDom;

		tf = jQuery('#toc-frame');
		tocRL.forEach(function(chap, cI) {
			cDom = tf.find('ul.toc-wrapper > li.toc-chap[data-c="'+cI+'"]');
			cDom.find('.readlist-c').prop('checked', chap.c);
			chap.s.forEach(function(sec, sI) {
				cDom.find('li[data-s="'+sI+'"] > .readlist').prop('checked', sec);
			});
		});
	} // updateTOCRL()

		// PURPOSE: Handle toggling between TOC and Text panes
	function clickHSTOC(event)
	{
		tocVis = !tocVis;
		if (tocVis) {
			tocSelDirty=false;
			jQuery('#toc-controls').show();
			jQuery('#toc-frame').show();
			jQuery('#text-controls').hide();
			jQuery('#text-frame').hide();
		} else {
			if (tocSelDirty) {
				buildTextFrame();
				paint();
			}
			jQuery('#toc-controls').hide();
			jQuery('#toc-frame').hide();
			jQuery('#text-controls').show();
			jQuery('#text-frame').show();
		}
		event.preventDefault();
	} // clickHSTOC()

		// PURPOSE: Handle click of chapter open/close toggle
	function clickTOCCollapse(event)
	{
		var btn = jQuery(this);
		var chap = btn.closest('li.toc-chap');
		var secs = chap.find('ul.toc-secs');
		secs.toggle();
		event.preventDefault();
	} // clickTOCCollapse()

		// PURPOSE: Handle click of Un/Check All (Reading List) checkbox on TOC
	function clickTOCHCAll(event)
	{
		var c = event.target.checked;
		for (var i=0; i<tocRL.length; i++) {
			var chap = tocRL[i];
			chap.c = c;
			for (var j=0; j<chap.s.length; j++) {
				chap.s[j] = c;
			}
		}
		updateTOCRL();
		// Don't prevent default, as that's what updates HTML Dom
	} // clickTOCHCAll()

		// PURPOSE: Handle click of De/Select All (Visible in Text Pane) checkbox on TOC
	function clickTOCHSAll(event)
	{
		tocSelDirty=true;
		var s = event.target.checked;
		tocSel.forEach(function(chap, cI) {
			var cDom = jQuery('#toc-frame > ul.toc-wrapper > li.toc-chap[data-c="'+cI+'"]');
			chap.c = s;
			for (i=0; i<chap.s.length; i++) {
				chap.s[i] = s;
			}
			if (s) {
				cDom.addClass('sel');
				cDom.find('ul.toc-secs > li').addClass('sel');
			} else {
				cDom.removeClass('sel');
				cDom.find('ul.toc-secs > li').removeClass('sel');
			}
		});
		// Don't prevent default, as that's what updates HTML Dom
	} // clickTOCHCAll()

		// PURPOSE: Handle a click on the text frame
		// NOTE: 	As there can be multiple refereces to same Record in text frame,
		//				we need to un/highlight all of them simultaneously!
	function clickTextFrame(event)
	{
		var a, i, id, n, t, x, v=views[1];
		var node = event.target;
		if (node.nodeName === 'A') {
			id = node.dataset.id;
			a = PData.nByID(id);
			if (a != null) {
				i = _.sortedIndex(selIDs, id);
					// If it already exists, remove it
				if (selIDs[i] === id) {
					selIDs.splice(i, 1);
					if (vMode === 'v2') {
						selAbsI=null;	// invalidate
						i = _.sortedIndex(selIS.s, a);
						selIS.s.splice(i, 1);
							// decrease Rec count for Template to which it belongs
						for (x=0, n=PData.eTNum(); x<n; x++) {
							t = selIS.t[x];
							if ((t.n > 0) && (i >= t.i) && (i < (t.i+t.n))) {
								t.n -= 1;
								x++;
								break;
							}
						}
						selIS.l -= 1;
						for (; x<n; x++) {
							selIS.t[x].i -= 1;
						}
					} else {
						selIS=null;		// invalidate
						i = _.sortedIndex(selAbsI, a);
						selAbsI.splice(i, 1);
					}
					jQuery('#text-frame a[data-id="'+id+'"]').removeClass('sel');
				} else {
					if (selIDs.length === 0) {
						selIDs.push(id);
					} else {
						selIDs.splice(i, 0, id);
					}
					if (vMode === 'v2') {
						selAbsI=null;	// invalidate
						if (selIS.s.length === 0) {
							i = 0;
							selIS.s.push(a);
						} else {
							i = _.sortedIndex(selIS.s, a);
							selIS.s.splice(i, 0, a);
						}
							// increase Rec count for Template to which it belongs
						x=PData.n2T(a);
						selIS.t[x++].n += 1;
						n=PData.eTNum();
						selIS.l += 1;
						for (; x<n; x++) {
							selIS.t[x].i += 1;
						}
					} else {
						selIS=null;		// invalidate
						if (selAbsI.length == 0) {
							selAbsI.push(a);
						} else {
							i = _.sortedIndex(selAbsI, a);
							selAbsI.splice(i, 0, a);
						}
					}
					jQuery('#text-frame a[data-id="'+id+'"]').addClass('sel');
				} // add ID
				switch (vMode) {
				case 'v0': 		// Show all Records, highlight selected
				case 'v1': 		// Show Records visible from Text, highlight selected
					if (selAbsI.length === 0) {
						v.clearSel();
					} else {
						v.setSel(selAbsI);
					}
					break;
				case 'v2': 		// Only Show selected Records
					v.clearSel();
					v.showStream(selIS);
					break;
				}
			} // ID has absI
		} // clicked link
		event.preventDefault();
	} // clickTextFrame()

		// PURPOSE: Handle click on a chapter in TOC
	function clickTOCChap(event)
	{
		var cI = event.target.dataset.c;
		if (typeof cI != 'undefined') {
			tocSelDirty=true;
				// De/Select chapter and all of its sections
			var chap = tocSel[cI];
			chap.c = !chap.c;
			var cDom = jQuery('#toc-frame > ul.toc-wrapper > li.toc-chap[data-c="'+cI+'"]');
			if (chap.c) {
				cDom.addClass('sel');
				// cDom.find('ul.toc-secs > li').addClass('sel');
				// for (i=0; i<chap.s.length; i++) {
				// 	chap.s[i] = true;
				// }
			} else {
				cDom.removeClass('sel');
				// cDom.find('ul.toc-secs > li').removeClass('sel');
				// for (i=0; i<chap.s.length; i++) {
				// 	chap.s[i] = false;
				// }
			}
			event.preventDefault();
		}
	} // clickTOCChap()

		// PURPOSE: Handle click on a section in TOC
	function clickTOCSec(event)
	{
		var sI = event.target.dataset.s;
		if (typeof sI != 'undefined') {
			tocSelDirty=true;
			var cDom = jQuery(event.target).closest('li.toc-chap');
			var cI = cDom.data('c');
			var chap = tocSel[cI];
			var sOn = (chap.s[sI] = !chap.s[sI]);
			var sDom = cDom.find('ul.toc-secs > li[data-s="'+sI+'"]');
			if (sOn) {
				sDom.addClass('sel');
			} else {
				sDom.removeClass('sel');
			}
			event.preventDefault();
		}
	} // clickTOCSec()

		// PURPOSE: Handle click on a RL checkbox in the TOC
	function clickRLCheck(event)
	{
		var on = event.target.checked;
		var cDom, sDom, cI, sI;
		if (event.target.className === 'readlist-c') {
			var cI = jQuery(event.target).closest('li.toc-chap').data('c');
			tocRL[cI].c = on;
		} else if (event.target.className === 'readlist') {
			var sI = jQuery(event.target).closest('li').data('s');
			var cI = jQuery(event.target).closest('li.toc-chap').data('c');
			tocRL[cI].s[sI] = on;
		}
		// Don't prevent default, as that's what updates HTML Dom
	} // clickRLCheck()


		// PURPOSE: Find previous selection in Reading List and select (and show in text frame)
		// NOTES: 	Current text in tocSel; look for prev in tocRL
		//			Does not wrap around to the end!
	function clickTextPrev(event)
	{
		event.preventDefault();

			// Find earliest visible selection, save value before it
		var ptrC=null, ptrS=null;
		var chap, cI, sI;
		search:
		for (cI=0; cI<tocSel.length; cI++) {
			chap=tocSel[cI];
			if (chap.c) {
				ptrC=cI-1;
				break;
			}
			for (sI=0; sI<chap.s.length; sI++) {
				if (chap.s[sI]) {
					ptrC = cI;
					ptrS = sI-1;
					break search;
				}
			}
		}
			// If no selection, ignore
		if (ptrC == null)
			return;

			// Find selection in RL immediately before that
		while (ptrC > -1) {
			chap = tocRL[ptrC];
			if (ptrS == null) {
				ptrS = chap.s.length-1;
			}
				// First check sections inside chapter
			for (; ptrS > -1; ptrS--) {
				if (chap.s[ptrS]) {
					setTOCSel(true, ptrC, ptrS);
					return;
				}
			}
			ptrS = null;
				// Then check chapter itself
			if (chap.c) {
				setTOCSel(true, ptrC, -1);
				return;
			}
			ptrC--;
		}
	} // clickTextPrev()

		// PURPOSE: Find next selection in Reading List and select (and show in text frame)
		// NOTES: 	Current text in tocSel; look for next in tocRL
		//			Does not wrap around to the beginning!
	function clickTextNext(event)
	{
		event.preventDefault();

			// Find last visible selection -- save next item
		var ptrC=null, ptrS=null;
		var chap, cI, sI;
		var newStart=false;
		search:
		for (cI=tocSel.length-1; cI >= 0; cI--) {
			chap = tocSel[cI];
			for (sI=chap.s.length-1; sI >= 0; sI--) {
				if (chap.s[sI]) {
					ptrS=sI+1;
					if (sI == chap.s.length-1) {
						ptrC=cI+1;
						ptrS=0;
						newStart=true;
					} else {
						ptrC=cI;						
					}
					break search;
				}
			}
			if (chap.c) {
				ptrC=cI;
				ptrS=0;
				break;
			}
		}
			// If no selection, ignore
		if (ptrC == null)
			return;

			// Find next item in RL after that
		while (ptrC < tocRL.length) {
			chap = tocRL[ptrC];
			if (newStart && chap.c) {
				setTOCSel(true, ptrC, -1);
				return;
			}
				// First finish examining sections in this chapter
			for (; ptrS<chap.s.length; ptrS++) {
				if (chap.s[ptrS]) {
					setTOCSel(true, ptrC, ptrS);
					return;
				}
			}
			ptrS=0;
			ptrC++;
			newStart=true;
		}
	} // clickTextNext()

		// PURPOSE: Handle clicking "Find" icon button in TOC
	function clickTOCFind(event)
	{
		var dialog;

		dialog = jQuery("#dialog-find-toc").dialog({
			height: 150,
			width: 250,
			modal: true,
			buttons: [
				{
					text: dlText.ok,
					click: function() {
						var txt = jQuery('#find-toc-txt').val();
						var fnd, cur;
						volData.forEach(function(chap, cI) {
								// Set to false by default
							fnd=false;
								// Check first in Chapter header
							if (chap.e.innerHTML.indexOf(txt) !== -1) {
								fnd=true;
							} else {
									// Check in following text (up to next section)
								cur = jQuery(chap.e).next();
								while (cur.length != 0) {
									switch (cur.prop('tagName').toUpperCase()) {
									case 'H1':
									case 'H2':
										cur=[];
										break;
									default:
										if (jQuery(cur).contents().text().indexOf(txt) !== -1) {
											fnd=true;
											cur=[];
										} else {
											cur = cur.next();
										}
										break;
									} // switch
								} // while
							}
							tocRL[cI].c = fnd;

							chap.s.forEach(function(sec, sI) {
								fnd=false;
									// Check first in Section header
								if (sec.innerHTML.indexOf(txt) !== -1) {
									fnd=true;
								} else {
										// Check in following text (up to next section)
									cur = jQuery(sec).next();
									while (cur.length != 0) {
										switch (cur.prop('tagName').toUpperCase()) {
										case 'H1':
										case 'H2':
											cur=[];
											break;
										default:
											if (jQuery(cur).contents().text().indexOf(txt) !== -1) {
												fnd=true;
												cur=[];
											} else {
												cur = cur.next();
											}
											break;
										} // switch
									} // while
								}
								tocRL[cI].s[sI] = fnd;
							});
						});
						updateTOCRL();
						dialog.dialog("close");
					}
				},
				{
					text: dlText.cancel,
					click: function() {
						dialog.dialog("close");
					}
				}
			]
		});

		event.preventDefault();
	} // clickTOCFind()

		// PURPOSE: Handle clicking "Find" icon button on Text Frame
	function clickTextFind(event)
	{
		clickHighlight(0, null);
		event.preventDefault();
	} // clickTextFind()

		// PURPOSE: Handle clicking global "Clear" icon button
	function clickClear(event)
	{
		var v=views[1];

		jQuery('#text-frame a').removeClass('sel');
		selIDs=[]; selAbsI=[]; selIS=null;
		if (v != null) {
			switch (vMode) {
			case 'v0': 		// Show all Records, highlight selected
			case 'v1': 		// Show Records visible from Text, highlight selected
				v.clearSel();
				break;
			case 'v2': 		// Only Show selected Records (none)
				selIDs2IS();
				v.showStream(selIS);
				break;
			}
		}
		event.preventDefault();
	} // clickClear()


		// IMMEDIATE EXECUTION
		//====================

	jQuery('body').addClass('waiting');

		// Localize color scheme?
	function localizeColor(c, div)
	{
		var clr = prspdata.bClrs[c];
		if (clr && clr.length > 0) {
			jQuery(div).css('background-color', clr);
		}
	} // localizeColor()
	localizeColor('cb', '#command-bar');

	PState.init();
	if (typeof PMapHub !== 'undefined') {
		PMapHub.init(prspdata.m);
	}

		// PURPOSE: Load all dynamic, language-independent resources
	(function () {
		var text;
		function loadFrag(domID, field)
		{
			text = document.getElementById(domID).innerHTML;
			dlText[field] = text.trim();
		} // loadFrag()

		loadFrag('dltext-removehideall', 'rha');
		loadFrag('dltext-showhideall', 'sha');
		loadFrag('dltext-ok', 'ok');
		loadFrag('dltext-cancel', 'cancel');
		loadFrag('dltext-choose-att', 'chsatt');
		loadFrag('dltext-seerec', 'seerec');
		loadFrag('dltext-close', 'close');
		loadFrag('dltext-add', 'add');
		loadFrag('dltext-manage', 'manage');
		loadFrag('dltext-delete', 'del');
		loadFrag('dltext-edit', 'edit');
		loadFrag('dltext-markers', 'markers');
		loadFrag('dltext-hint-marker', 'markersize');
		loadFrag('dltext-hint-text', 'textsize');
		loadFrag('dltext-xaxis', 'xaxis');
		loadFrag('dltext-yaxis', 'yaxis');
		loadFrag('dltext-undefined', 'undef');
		loadFrag('dltext-orderedby', 'orderedby');
		loadFrag('dltext-grpblks', 'grpblks');
		loadFrag('dltext-reset', 'reset');
		loadFrag('dltext-nofilter', 'nofilter');
		loadFrag('dltext-dofilters', 'dofilters');
		loadFrag('dltext-filtered', 'filtered');

		text = document.getElementById('dltext-month-names').innerHTML;
		months = text.trim().split('|');

			// Do we need to localize D3?
		if (text = document.getElementById('dltext-d3-local')) {
			if ((text = text.innerHTML) && (text.length > 1))
			{
				var locale = d3.locale(JSON.parse(text));
				localD3 = locale.timeFormat.multi([
					["%H:%M", function(d) { return d.getMinutes(); }],
					["%H:%M", function(d) { return d.getHours(); }],
					["%a %d", function(d) { return d.getDay() && d.getDate() != 1; }],
					["%b %d", function(d) { return d.getDate() != 1; }],
					["%B", function(d) { return d.getMonth(); }],
					["%Y", function() { return true; }]
				]);
			}
		}
	}());

		// Remove any Reading query string and prefix and trailing /
	volURL = window.location.pathname;
	volURL = volURL.replace(/\&*reading=[\w\-]+/, '');
	volURL = volURL.replace(/\/$/, '');
	volURL = volURL.replace(/^\//, '');
	volURL = "http://" + window.location.host + "/" + volURL;

		// Create string to add to Filter Headers inserting Template IDs & labels
	(function () {
		var at = _.template(document.getElementById('dltext-filter-template').innerHTML);
		var ts = [];
		prspdata.t.forEach(function(tmplt, ti) {
			ts.push(at({ ti: ti, tl: tmplt.def.l }));
		});
		apTmStr = ts.join('&nbsp;');
	}());

		// Insert relevant Attribute IDs into Sort by Dialog
	(function () {
		var att;
		prspdata.t.forEach(function(tmplt, ti) {
			var opts='';
			tmplt.def.a.forEach(function(attID) {
				att = PData.aByID(attID);
				switch (att.def.t) {
				case 'T':
				case 'V':
				case 'N':
				case 'D':
					opts += '<option value="'+attID+'">'+att.def.l+'</option>';
					break;
				}
			});
			jQuery('#dialog-sortby').append('<b>'+tmplt.def.l+'</b>: <select data-ti='+ti+'>'+opts+'</select><br/>');
		});
	}());

		// Ensure proper ending for creating URLs
	if (prspdata.site_url.charAt(prspdata.site_url.length-1) != '/')
		prspdata.site_url += '/';

	if (prspdata.e.g.l != '')
		jQuery('#title').text(prspdata.e.g.l);

		// Is there a local storage mechanism? Get local Readings if so
	try {
		var storage = window['localStorage'], x = '__storage_test__';
		storage.setItem(x, x);
		storage.removeItem(x);
		var lp = storage.getItem(prspdata.e.id);
		localStore = storage;
		if (lp.length > 0)
			localReadings = JSON.parse(lp);
	} catch(e) {
	}

		// Command Bar
	jQuery('#btn-about').button({icons: { primary: 'ui-icon-power' }, text: false })
			.click(clickAbout);
	jQuery('#btn-show-reading').button({icons: { primary: 'ui-icon-image' }, text: false })
			.click(clickShowReading);
	jQuery('#btn-save-reading').button({icons: { primary: 'ui-icon-pencil' }, text: false })
			.click(clickSaveReading);
	jQuery('#btn-annote').button({icons: { primary: 'ui-icon-comment' }, text: false })
			.click(clickAnnotation);

		// Text Frame icon buttons
	jQuery('#hstoc').button({icons: { primary: 'ui-icon-bookmark' }, text: false })
		.click(clickHSTOC);
	jQuery('#tochcall').click(clickTOCHCAll);
	jQuery('#tochsall').click(clickTOCHSAll);
	jQuery('#tocfind').button({icons: { primary: 'ui-icon-star' }, text: false })
		.click(clickTOCFind);
	jQuery('#textprev').button({icons: { primary: 'ui-icon-arrow-1-w' }, text: false })
		.click(clickTextPrev);
	jQuery('#textnext').button({icons: { primary: 'ui-icon-arrow-1-e' }, text: false })
		.click(clickTextNext);
	jQuery('#texthilite').button({icons: { primary: 'ui-icon-star' }, text: false })
		.click(clickTextFind);
	jQuery('#clearsel').button({icons: { primary: 'ui-icon-cancel' }, text: false })
		.click(clickClear);
	jQuery('#textosel').button({icons: { primary: 'ui-icon-search' }, text: false })
		.click(clickTextShow);
	jQuery('#text-frame').click(clickTextFrame);
	jQuery('input[type=radio][name=vizmode]').change(function() {
		vMode = this.value;
		paint();
	});


		// Are there Home settings?
	if (prspdata.e.g.hbtn.length > 0 && prspdata.e.g.hurl.length > 0) {
		jQuery('#home-title').text(prspdata.e.g.hbtn);
		jQuery('#btn-home').button({icons: { primary: 'ui-icon-home' }, text: false })
				.click(clickGoHome);
	} else {
		jQuery('#btn-home').remove();
	}

		// Handle selection of item on New Filter modal
	jQuery('#filter-list').click(function(event) {
			// Special case for "Hide/Remove All" pseudo-Filter
		if (event.target.nodeName == 'I') {
			jQuery("#filter-list li").removeClass("selected");
			jQuery(event.target).parent().addClass("selected");
		} else if (event.target.nodeName == 'LI') {
			jQuery("#filter-list li").removeClass("selected");
			jQuery(event.target).addClass("selected");
		}
	});

		// Handle selection of item on Show Readings list
	jQuery('#reading-slist').click(function(event) {
		if (event.target.nodeName == 'LI') {
			jQuery("#reading-slist li").removeClass("selected");
			jQuery(event.target).addClass("selected");
		}
	});

	jQuery('#dialog-about .logo').attr("src", prspdata.assets+"prospectlogo.jpg");

		// Inspector Modal
	jQuery('#btn-inspect-left').button({ icons: { primary: 'ui-icon-arrowthick-1-w' }, text: false });
	jQuery('#btn-inspect-right').button({ icons: { primary: 'ui-icon-arrowthick-1-e' }, text: false });

		// Create New Filter list
	(function () {
		jQuery('#filter-list').append('<li class="remove" data-id="_remove"><i>'+dlText.rha+'</i></li>');
		prspdata.a.forEach(function(theAtt) {
			switch (theAtt.def.t) {
			case 'V':
			case 'T':
			case 'g':
			case 'N':
			case 'D':
				jQuery('#filter-list').append('<li data-id="'+theAtt.id+'">'+theAtt.def.l+'</li>');
				break;
			}
		});
	}());

		// Restore Reading or create default?
	if (prspdata.show_reading.length == 0 || !doShowReading(prspdata.show_reading)) {
		views[1] = PViewFrame(1);
		views[1].initDOM(0);
		setAnnote('');
	}

		// Allow ViewFrames to handle changes in size
	jQuery(window).resize(function() {
		if (views[1]) {
			views[1].resize();
		}
	});

		// Prepare Text Frame first
	parseVol();
	buildTOC();
	updateTOCRL();
	updateTOCSel();
	buildTextFrame();

		// Intercept global signals: data { s[tate] }
	jQuery("body").on("prospect", function(event, data) {
		switch (data.s) {
		case PSTATE_PROCESS:
				// ASSUMED: This won't be triggered until after Volume, Filters & Views set up
			PState.set(PSTATE_PROCESS);
			doRecompute();
			for (var h=0; h<2; h++) {
				if (hFilters[h] !== null) {
					doApplyHighlight(h);
				}
			}
			PState.set(PSTATE_READY);
			jQuery('body').removeClass('waiting');
			break;
		// case PSTATE_FDIRTY:
		// 	fState = 1;
		// 	jQuery('#btn-f-state').prop('disabled', false).html(dlText.dofilters);
		// 	break;
		case PSTATE_HILITE:
			clickHighlight(data.v, data.t);
			break;
		}
	});

		// Init hub using config settings
	PState.set(PSTATE_LOAD);
	PData.init();
});

	// Interface between embedded YouTube player and code that uses it
	// This is called once iFrame and API code is ready
function onYouTubeIframeAPIReady()
{
		// Call saved function call
	if (widgetData.ytCall)
		widgetData.ytCall();
} // onYouTubeIframeAPIReady()