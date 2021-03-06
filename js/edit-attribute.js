// Attribute Editor

// ASSUMES: A view area for the browser has been marked with HTML div as "ractive-output"
// NOTES:   See notes in class-prospect-admin.php about JSON, Unicode and UTF-8
// USES:    jQuery, Underscore, jQueryUI, and Ractive


// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/findIndex
if (!Array.prototype.findIndex) {
  Array.prototype.findIndex = function(predicate) {
	if (this == null) {
	  throw new TypeError('Array.prototype.find called on null or undefined');
	}
	if (typeof predicate !== 'function') {
	  throw new TypeError('predicate must be a function');
	}
	var list = Object(this);
	var length = list.length >>> 0;
	var thisArg = arguments[1];
	var value;

	for (var i = 0; i < length; i++) {
	  value = list[i];
	  if (predicate.call(thisArg, value, i, list)) {
		return i;
	  }
	}
	return -1;
  };
}


jQuery(document).ready(function() {
	Ractive.decorators.iconButton = function (node, icon) {
		jQuery(node).button({
			text: false,
			icons: { primary: icon }
		});

		return {
			teardown: function () {
				jQuery(node).button('destroy');
			}
		}
	};


		// Create Ractive component to wrap jQueryUI Dialog
	var RJDialogComponent = Ractive.extend({
		template: '#dialog-r-template',
		data: function() {
			return {
				title: '',
				width: 350,
				height: 350,
				cancel: true
			}
		}, // data

			// Intercept render to insert and active jQueryUI plugin
		onrender: function() {
			var self = this;
			var thisComponent = this.find('*');
			var theButtons = [ {
					text: 'OK',
					click: function() {
						self.fire('ok');
					}
				} ];
			if (self.get('cancel')) {
				theButtons.push( {
					text: 'Cancel',
					click: function() {
						self.fire('cancel');
					}
				} );
			}
			self.modal = jQuery(thisComponent).dialog({
				width: self.get('width'),
				height: self.get('height'),
				modal : true,
				autoOpen: true,
				buttons: theButtons
			});
			// self.modal.dialog('open');
		}, // onrender

			// Intercept teardown so that jQueryUI component destroyed
		onteardown: function () {
			this.modal.dialog('destroy');
		} // onteardown
	});


	var RJIrisColor = Ractive.extend({
		template: '#iris-r-template',
		data: function() {
			return {
				color: ''				// the selected color
			}
		}, // data
		onrender: function() {
			var self = this;
			var thisComponent = this.find('.jq-iris-template');

			jQuery(thisComponent).iris({
				width: 200,
				hide: false,
				palettes: true,
				change: function(event, ui) {
					self.set('color', ui.color.toString());
				}
			});
		}, // onrender()

			// Intercept teardown to create jQueryUI component
		onteardown: function () {
			var thisComponent = this.find('.jq-iris-template');
			jQuery(thisComponent).iris('destroy');
		} // onteardown()
	});


		// DATA LOADED FROM SERVER
		// =======================
	var customFields = prspdata.cfs;			// Custom fields used in Records
	var allAttributeIDs = prspdata.att_ids;	// List of previously defined Attributes (not including this one!)

		// LIVE DATA ABOUT THIS ATTRIBUTE
		// ==============================
	var attID;
	var privacy;
	var defAttribute = { l: '', t: 'V', d: '', h: '' };		// l(abel), t(ype), d(elimiter), h(int)
	var chosenCF = customFields[0] || '';
	var defRange = { };					// current Range definition
	var defLegend = [ ];				// current Legend definition

		// OTHER VARS
		// ==========
	var rApp;							// the main Ractive application
	var newVocab = '';					// new Vocabulary item
	var errTimer;
	var errorString = '';				// error readout
	var savedRanges = [ ];				// saved Range settings
	var savedLegends = [ ];				// saved Legend configurations

	var otherAtts;						// results of attMatch()

	var embedData;

	var dataTypes=[];					// { code, label }
	embedData = document.getElementById('dltext-attributes').innerHTML;
	embedData = embedData.trim().split('|');
	embedData.forEach(function(dType) {
		var p = dType.split(',');
		dataTypes.push({code: p[0], label: p[1]});
	});

		// Compact representations saved for Attributes are unpacked for use on GUI (unsaved unpacked fields marked with '*')
		// Generic Legend definition: l = label (String), d = data (Type-specific), v = visual code
		//		val* = value (String representation)
		// Vocabulary Legend definition: l = label (String), v = visual code, z = children
		//   If a 2ndary child node, v = '' indicates inheriting from parent

		// Data for ranges and legends are stored as strings because must allow for empty values
		//		This is packed and unpacked on load and save

	attID = jQuery('input[name="prsp_att_id"]').val();
	privacy = jQuery('textarea[name="prsp_att_privacy"]').val();
	if (privacy == '') privacy = 'o';

		// Unpack and prepare the Attribute definition
	embedData = jQuery('textarea[name="prsp_att_def"]').val();
	if (embedData && embedData.length > 2) {
		defAttribute = JSON.parse(embedData);
	}
	defAttribute.id = attID;

		// Define f[ilter] flag if left undefined -- only relevant for some Attribute types
	if (typeof defAttribute.f === 'undefined') {
		switch (defAttribute.t) {
		case 'V':
		case 'T':
		case 'g':
		case 'N':
		case 'D':
			defAttribute.f = true;
			break;
		default:
			defAttribute.f = false;
			break;
		} // switch
	}

	embedData = jQuery('textarea[name="prsp_att_r"]').val();
	if (embedData && embedData.length > 2) {
		defRange = JSON.parse(embedData);
			// Interpret undefined range values -- turn into strings
		switch (defAttribute.t) {
		case 'N':
			if (typeof(defRange.min) == 'undefined')
				defRange.min = '';
			else
				defRange.min = defRange.min.toString();
			if (typeof(defRange.max) == 'undefined')
				defRange.max = '';
			else
				defRange.max = defRange.max.toString();

			if (typeof(defRange.u) == 'undefined') {
				defRange.u = '#888888';
				defRange.useU = false;
			} else
				defRange.useU = true;
			break;
		case 'D':
				// Convert into 
			defRange.min.y = defRange.min.y.toString();
			if (typeof(defRange.min.m) == 'undefined')
				defRange.min.m = '';
			else
				defRange.min.m = defRange.min.m.toString();
			if (typeof(defRange.min.d) == 'undefined')
				defRange.min.d = '';
			else
				defRange.min.d = defRange.min.d.toString();
			if (typeof(defRange.max.y) == 'undefined') {
				defRange.max.y = defRange.max.m = defRange.max.d = '';
			} else {
				defRange.max.y = defRange.max.y.toString();
				if (typeof(defRange.max.m) == 'undefined')
					defRange.max.m = '';
				else
					defRange.max.m = defRange.max.m.toString();
				if (typeof(defRange.max.d) == 'undefined')
					defRange.max.d = '';
				else
					defRange.max.d = defRange.max.d.toString();
			}
			if (typeof(defRange.u) == 'undefined') {
				defRange.u = '#888888';
				defRange.useU = false;
			} else
				defRange.useU = true;
			break;
		} // switch
	}

		// PURPOSE: Reformat raw Legend array for editing purposes into defLegend
	function unpackLegend(legArray)
	{
		defLegend=[];

		legArray.forEach(function(lgndEntry) {
			var newEntry = lgndEntry;
			switch (defAttribute.t) {
			case 'V':
				var newZ = [];
				lgndEntry.z.forEach(function(child) {
					var newChild = {};
						// v is null if uses parent as default
					if (child.v != null) {
						newChild.v = child.v;
						newChild.l = child.l;
					} else {
						newChild.l = child.l;
						newChild.v = '';
					}
					newZ.push(newChild);
				});
				newEntry.z = newZ;
				break;
			case 'T':
				newEntry.val = newEntry.d;
				break;
			case 'N':
				if (typeof(lgndEntry.d.min) == 'undefined')
					newEntry.d.min = '';
				else
					newEntry.d.min = newEntry.d.min.toString();
				if (typeof(lgndEntry.d.max) == 'undefined')
					newEntry.d.max = '';
				else
					newEntry.d.max = newEntry.d.max.toString();
				newEntry.val = (newEntry.d.min.length == 0) ? '(none)' : newEntry.d.min;
				newEntry.val += ' to ';
				newEntry.val += (newEntry.d.max.length == 0) ? '(none)' : newEntry.d.max;
				break;
			case 'D':
				newEntry.d.min.y = newEntry.d.min.y.toString();
				if (typeof(newEntry.d.min.m) == 'undefined')
					newEntry.d.min.m = '';
				else
					newEntry.d.min.m = newEntry.d.min.m.toString();					
				if (typeof(newEntry.d.min.d) == 'undefined')
					newEntry.d.min.d = '';
				else
					newEntry.d.min.d = newEntry.d.min.d.toString();
				if (typeof(newEntry.d.max.y) == 'undefined') {
					newEntry.d.max.y = '';
					newEntry.d.max.m = '';
					newEntry.d.max.d = '';
				} else {
					newEntry.d.max.y = newEntry.d.max.y.toString();
					if (typeof(newEntry.d.max.m) == 'undefined')
						newEntry.d.max.m = '';
					else
						newEntry.d.max.m = newEntry.d.max.m.toString();					
					if (typeof(newEntry.d.max.d) == 'undefined')
						newEntry.d.max.d = '';
					else
						newEntry.d.max.d = newEntry.d.max.d.toString();
				}
				var val;
				val = newEntry.d.min.y;
				if (newEntry.d.min.m.length) {
					val += '-'+ newEntry.d.min.m;
					if (newEntry.d.min.d.length) {
						val += '-'+ newEntry.d.min.d;
					}
				}
				val += ' / ';
				if (newEntry.d.max.y.length) {
					val += newEntry.d.max.y;
					if (newEntry.d.max.m.length) {
						val += '-'+ newEntry.d.max.m;
						if (newEntry.d.max.d.length) {
							val += '-'+ newEntry.d.max.d;
						}
					}
				} else
					val += ' (now)';
				newEntry.val = val;
				break;
			} // switch
			defLegend.push(newEntry);
		}); // forEach
	} // unpackLegend()


		// Unpack Legend data
	embedData = jQuery('textarea[name="prsp_att_lgnd"]').val();
	if (embedData && embedData.length > 2) {
		tempLegend = JSON.parse(embedData);

		unpackLegend(tempLegend);
	} // if legend


		// PURPOSE: Retrieve language-dependent text embedded in script
	function getText(scriptName)
	{
		return jQuery(scriptName).html().trim();
	}


	function createEditDialog(divID, editData) {
		return new Ractive({
			el: '#att-insert-dialog',
			template: divID,
			data: editData,
			components: {
				dialog: RJDialogComponent
			}
		}); // new Ractive()
	} // createEditDialog()


		// PURPOSE: Extract settings and create new Legend entry
		// NOTES:   Set fields l, d, and val
		// TO DO: 	Error checking
	function extractLegendEntry(editDialog) {
		var newEntry = { };
		newEntry.l = editDialog.get('label').replace(/"/g, '').trim();

		switch (rApp.get('theAttribute.t')) {
		case 'T':
			newEntry.d = editDialog.get('pattern');
			newEntry.val = newEntry.d;
			break;
		case 'N':
			newEntry.d = { min: editDialog.get('min').trim(), max: editDialog.get('max').trim() };
			newEntry.val = (newEntry.d.min.length == 0) ? '(none)' : newEntry.d.min;
			newEntry.val += ' to ';
			newEntry.val += (newEntry.d.max.length == 0) ? '(none)' : newEntry.d.max;
			break;
		case 'D':
			newEntry.d = { };
			newEntry.d.min = { y: editDialog.get('min.y'), m: editDialog.get('min.m'), d: editDialog.get('min.d') };
			newEntry.d.max = { y: editDialog.get('max.y'), m: editDialog.get('max.m'), d: editDialog.get('max.d') };
			var val;
			val = newEntry.d.min.y;
			if (newEntry.d.min.m.length) {
				val += '-'+ newEntry.d.min.m;
				if (newEntry.d.min.d.length) {
					val += '-'+ newEntry.d.min.d;
				}
			}
			val += ' / ';
			if (newEntry.d.max.y.length) {
				val += newEntry.d.max.y;
				if (newEntry.d.max.m.length) {
					val += '-'+ newEntry.d.max.m;
					if (newEntry.d.max.d.length) {
						val += '-'+ newEntry.d.max.d;
					}
				}
			} else
				val += ' (now)';
			newEntry.val = val;
			break;
		} // switch
		return newEntry;
	} // extractLegendEntry()


		// PURPOSE: Show message for 5 seconds
	function displayError(errID, ok)
	{
			// If a clear-error timer is set, cancel it
		if (errTimer) {
			clearTimeout(errTimer);
			jQuery('#error-frame').removeClass('ok');
		}
		var newError = getText(errID);
		rApp.set('errorMsg', newError);
		if (ok === true) {
			jQuery('#error-frame').addClass('ok');
		}
		errTimer = setTimeout(function() { rApp.set('errorMsg', ''); jQuery('#error-frame').removeClass('ok'); }, 5000);
	} // displayError()


		// PURPOSE: Check basic data provided by the user for Attribute definition
		// RETURNS: false if basic errors, else Attribute object with ID, Label, cf, delim
		// SIDE-FX: sets errorMsg to explanation of error
	function doErrorCheck()
	{
		var theID = rApp.get('attID').trim();
		if (theID.length == 0) {
			displayError('#errmsg-no-id');
			return false;
		}
		if (theID.length > 24) {
			displayError('#errmsg-id-too-long');
			return false;
		}
		if (allAttributeIDs.findIndex(function(existingID) { return existingID === theID; }) != -1) {
			displayError('#errmsg-id-taken');
			return false;
		}
			// Ensure ID only consists of alphanumeric, underscore or hyphen
		if (!/^[\w\-]+$/.test(theID)) {
			displayError('#errmsg-id-bad-chars');
			return false;
		}

		var theLabel = rApp.get('theAttribute.l').trim().replace(/"/g, '');
		if (theLabel.length == 0) {
			displayError('#errmsg-no-label');
			return false;
		}
		if (theLabel.length > 32) {
			displayError('#errmsg-label-too-long');
			return false;
		}

		var attType = rApp.get('theAttribute.t');
		var canFilter = rApp.get('theAttribute.f');

		var theDelim = rApp.get('theAttribute.d');
		if (theDelim.length > 1) {
			displayError('#errmsg-delim-too-long');
			return false;
		} else if (theDelim.length == 1) {
			if (theDelim === ' ') {
				displayError('#errmsg-delim-no-sp');
				return false;
			}

			switch (attType) {
			case 'V':
			case 'g':
			case 'P':
				break;
			case 'L':
				if (theDelim === ',') {
					displayError('#errmsg-delim-comma-ll');
					return false;
				}
				break;
			default:
				displayError('#errmsg-delim-bad-type');
				return false;
			}
		}
		var theHint = rApp.get('theAttribute.h');
		theHint = theHint.replace(/"/g, '');

		return { l: theLabel, t: attType,
				 d: theDelim, h: theHint, f: canFilter };
	} // doErrorCheck()

		// PURPOSE: Find pre-defined Attributes of this type that have Legends
		// RETURN: 	Array of { Attribute id, l[abel] }
	function attMatch(type, notID)
	{
		var atts=[];

		if (prspdata.att_data.length === 0)
			return [];
		prspdata.att_data.forEach(function(theAtt) {
			if (theAtt.def.t === type && theAtt.id !== notID && theAtt.l.length > 0)
				atts.push({ id: theAtt.id, l: theAtt.def.l })
		});
		return atts;
	} // attMatch()

		// PURPOSE: Present user message in modal dialog box
	function messageModal(mText)
	{
		var modalDialog = new Ractive({
			el: '#att-insert-dialog',
			template: '#dialog-message',
			data: {
				message: mText
			},
			components: {
				dialog: RJDialogComponent
			}
		}); // new Ractive()

		modalDialog.on('dialog.ok', function() {
			modalDialog.teardown();
			return false;
		});
	} // messageModal()

		// PURPOSE: Present a confirmation modal
		// RETURNS: true if OK, false if Cancel
	function confirmModal(msgID, callback)
	{
		var mText = getText(msgID);
		var modalDialog = new Ractive({
			el: '#att-insert-dialog',
			template: '#dialog-confirm',
			data: {
				message: mText
			},
			components: {
				dialog: RJDialogComponent
			}
		}); // new Ractive()

		modalDialog.on('dialog.ok', function() {
			callback();
			modalDialog.teardown();
		});
		modalDialog.on('dialog.cancel', modalDialog.teardown);
	} // confirmModal()

	otherAtts = attMatch(defAttribute.t, attID);

		// Create our main App Ractive instance with wrapped jQueryUI components
	rApp = new Ractive({
		el: '#ractive-output',
		template: '#ractive-base',
		data: {
			theAttribute: defAttribute,
			attID: attID,
			privacy: privacy,
			dataTypes: dataTypes,
			cfs: customFields,
			chosenCF: chosenCF,
			theLegend: defLegend,
			theRange: defRange,
			newVocab: newVocab,
			errorMsg: errorString,
			others: otherAtts
		},
	});

		// Observe data-type selections: re-init when user makes new selection
		// 	initially oldValue == undefined
	rApp.observe('theAttribute.t', function (newValue, oldValue, keypath) {
			// Save current range and Legend settings, if not initial values
		if (typeof(oldValue) !== 'undefined') {
				// use old data type as index into saved area
			savedLegends[oldValue] = rApp.get('theLegend');
			savedRanges[oldValue] = rApp.get('theRange');

				// Restore previous Legend configuration (if it exists)
			if (savedLegends[newValue]) {
				rApp.set('theLegend', savedLegends[newValue]);
			} else {
				rApp.set('theLegend', []);
			}

				// Compile new array of "peer" Attributes
			otherAtts = attMatch(newValue, rApp.get('attID'));
			rApp.set('others', otherAtts);

				// Restore previous Ranges if they exist, or initialize new ones
			if (savedRanges[newValue]) {
				rApp.set('theRange', savedRanges[newValue]);
			} else {
					// Create new defaults
				switch(newValue) {
				case 'N':
					rApp.set('theRange', { min: '', max: '', g: 0, u: '#888888', useU: false });
					break;
				case 'D':
					rApp.set('theRange', {
								min: { d: '', m: '', y: '' }, 
								max: { d: '', m: '', y: '' },
								g: 'y',
								u: '#888888', useU: false
							});
					break;
				}
			}
		}
	}); // observe theAttribute.t

		// TO DO: Observe attID so that otherAtts list is correct ??

		// Reset visual codes algorithmically
	rApp.on('resetLegend', function() {
		var lgnd = rApp.get('theLegend');

		var modalDialog = new Ractive({
			el: '#att-insert-dialog',
			template: '#dialog-reset-colors',
			data: {
				reset: 'random',
				c0: randomColor(),
				c1: randomColor()
			},
			components: {
				dialog: RJDialogComponent
			}
		}); // new Ractive()
		modalDialog.on('selectColor', function(evt, i) {
			var theColor = modalDialog.get('c'+i);
			var colorPicker = new Ractive({
				el: '#insert-2nd-dialog',
				template: '#dialog-choose-color',
				data: {
					color: theColor
				},
				components: {
					dialog: RJDialogComponent,
					iris: RJIrisColor
				}
			}); // new Ractive()
			colorPicker.on('dialog.ok', function() {
				var finalColor = colorPicker.get('color');
				modalDialog.set('c'+i, finalColor);
				colorPicker.teardown();
			});
			colorPicker.on('dialog.cancel', colorPicker.teardown);
		});
		modalDialog.on('dialog.ok', function() {
			if (modalDialog.get('reset') == 'gradient') {
				var c0 = modalDialog.get('c0');
				var c1 = modalDialog.get('c1');
				var rainbow = new Rainbow();
				rainbow.setSpectrum(c0, c1);
				rainbow.setNumberRange(0, lgnd.length-1);

				for (var i=0; i<lgnd.length; i++) {
					var item = 'theLegend['+i+'].';
					var grad = '#'+rainbow.colourAt(i);
					rApp.set(item+'v', grad);
					var children = rApp.get(item+'z');
					if (typeof(children) !== 'undefined') {
						for (var j=0; j<children.length; j++) {
							var child = item+'z['+j+'].';
							rApp.set(child+'v', '');
						}
					}
				}

			} else {	// Random colors
				for (var i=0; i<lgnd.length; i++) {
					var item = 'theLegend['+i+'].';
					var r = randomColor();
					rApp.set(item+'v', r);
					var children = rApp.get(item+'z');
					if (typeof(children) !== 'undefined') {
						for (var j=0; j<children.length; j++) {
							var child = item+'z['+j+'].';
							r = randomColor();
							rApp.set(child+'v', r);
						}
					}
				}
			}
			modalDialog.teardown();
		});
		modalDialog.on('dialog.cancel', function() {
			modalDialog.teardown();
		});
		return false;
	}); // on resetLegend

		// Pop up modal with hint about IDs
	rApp.on('idHint', function() {
		var hint = getText('#errmsg-id-bad-chars');
		messageModal(hint);
		return false;
	});

		// User asked for new Legend entry
	rApp.on('addLegend', function() {
		var editDialog;
		var editBlob = { };

		switch (rApp.get('theAttribute.t')) {
		case 'V':
				// Must provide a valid term, and it must not already exist
			var newTerm = rApp.get('newVocab').replace(/"/g, '').trim();
			if (newTerm.length == 0) {
				displayError('#errmsg-no-term-name');
				return false;
			}
			var legArray = rApp.get('theLegend');
			if (legArray.findIndex(function(item) { return item.l === newTerm; }) != -1) {
				displayError('#errmsg-term-name-taken');
				return false;
			}
			rApp.splice('theLegend', 0, 0, { l: newTerm, v: '#888888', z: [] });
			break;
		case 'T':
			editBlob.label = '';
			editBlob.pattern = '';
			editDialog = createEditDialog('#dialog-legend-text', editBlob);
			break;
		case 'N':
			editBlob.label = '';
			editBlob.min = rApp.get('theRange.min');
			editBlob.max = rApp.get('theRange.max');
			editDialog = createEditDialog('#dialog-legend-number', editBlob);
			break;
		case 'D':
			editBlob.label = '';
			editBlob.min = { y: rApp.get('theRange.min.y'),
							 m: rApp.get('theRange.min.m'),
							 d: rApp.get('theRange.min.d') };
			editBlob.max = { y: rApp.get('theRange.max.y'),
							 m: rApp.get('theRange.max.m'),
							 d: rApp.get('theRange.max.d') };
			editDialog = createEditDialog('#dialog-legend-dates', editBlob);
			break;
		} // switch()

		if (editDialog) {
			editDialog.on('dialog.ok', function(evt) {
				var newEntry = extractLegendEntry(editDialog);
				newEntry.v   = '#888888';
				rApp.push('theLegend', newEntry);
				editDialog.teardown();
				return false;
			});
			editDialog.on('dialog.cancel', editDialog.teardown);
		} // if
		return false;
	}); // on addLegend


		// PURPOSE: Give user chance to copy the Legend from another Attribute of same type
	rApp.on('copyLegend', function() {
		var modalDialog = new Ractive({
			el: '#att-insert-dialog',
			template: '#dialog-copy-legend',
			data: {
				others: otherAtts,
				fid: otherAtts[0].id
			},
			components: {
				dialog: RJDialogComponent
			}
		}); // new Ractive()
		modalDialog.on('dialog.ok', function() {
			var choice = modalDialog.get('fid');

			for (var i=0; i<prspdata.att_data.length; i++) {
				var theAtt = prspdata.att_data[i];
				if (theAtt.id == choice) {
					unpackLegend(theAtt.l);
					rApp.set('theLegend', defLegend);
					break;
				}
			}
			modalDialog.teardown();
		});
		modalDialog.on('dialog.cancel', function() {
			modalDialog.teardown();
		});

		return false;
	});


		// PURPOSE: Provide options for moving term and children (if any)
		// INPUT: index2 = undefined if top-level parent
	rApp.on('doVocabMove', function(event, index1, index2) {
			// If there is only one term, can’t do anything
		var legend = rApp.get('theLegend');
		if (legend.length < 2) {
			displayError('#errmsg-too-few-vocab');
			return false;
		}
			// Get array of names of all top-level Vocabulary items (except this parent)
		var parentNames = [];
		for (var i=0; i<legend.length; i++)
			if (i != index1)
				parentNames.push(rApp.get('theLegend['+i+'].l'));

		var modalDialog;

			// is this a 2ndary-level child?
		if (typeof(index2) !== 'undefined') {
			modalDialog = new Ractive({
				el: '#att-insert-dialog',
				template: '#dialog-move-vocab-child',
				data: {
					up: 'yes',
					newParent: parentNames[0],
					parents: parentNames
				},
				components: {
					dialog: RJDialogComponent
				}
			}); // new Ractive()

			modalDialog.on('dialog.ok', function() {
					// Extract it first
				rApp.splice('theLegend['+index1+'].z', index2, 1).then(function(spliced) {
						// Move it to top level?
					if (modalDialog.get('up') === 'yes') {
						var child = spliced[0];
							// do we need to give new default visual config?
						if (child.v === '')
							child.v = '#888888';
							// We need to add empty children array to it!
						child.z = [];
						rApp.splice('theLegend', 0, 0, child);
					} else {
							// Get index of new parent
						var newParent = modalDialog.get('newParent');
						var newIndex = legend.findIndex(function(item) { return item.l === newParent; });
						if (newIndex != -1)
								// Insert into new parent's array
							rApp.splice('theLegend['+newIndex+'].z', 0, 0, spliced[0]);
					}
				});
				modalDialog.teardown();
				return false;
			});
			modalDialog.on('dialog.cancel', modalDialog.teardown);

			// It is a top-level term
		} else {

				// Does it have children?
			var children = rApp.get('theLegend['+index1+'].z');
				// No children
			if (children.length == 0) {
				modalDialog = new Ractive({
					el: '#att-insert-dialog',
					template: '#dialog-move-vocab-lone',
					data: {
						keep: 'yes',
						newParent: parentNames[0],
						parents: parentNames
					},
					components: {
						dialog: RJDialogComponent
					}
				}); // new Ractive()

				modalDialog.on('dialog.ok', function() {
						// Extract it first
					rApp.splice('theLegend', index1, 1).then(function(spliced) {
						var newChild = spliced[0];
							// Remove its children array
						delete newChild.z;

							// Clear visual data?
						if (modalDialog.get('keep') === 'no')
							newChild.v = '';
							// Get index of new parent
						var newParent = modalDialog.get('newParent');
						var newIndex = legend.findIndex(function(item) { return item.l === newParent; });
						if (newIndex != -1)
								// Insert into new parent's array
							rApp.push('theLegend['+newIndex+'].z', newChild);
					});
					modalDialog.teardown();
				}); // OK
				modalDialog.on('dialog.cancel', modalDialog.teardown);

				// Has children
			} else {
					// Add option to move all children to top
				modalDialog = new Ractive({
					el: '#att-insert-dialog',
					template: '#dialog-move-vocab-parent',
					data: {
						up: 'yes',
						newParent: parentNames[0],
						parents: parentNames
					},
					components: {
						dialog: RJDialogComponent
					}
				}); // new Ractive()

				modalDialog.on('dialog.ok', function() {
					var newParent, newIndex;
					if (modalDialog.get('up') === 'no') {
						newParent = modalDialog.get('newParent');
						newIndex = legend.findIndex(function(item) { return item.l === newParent; });
					}
						// Need recursive function to handle Promises
					function doNextChild()
					{
							// Can we end recursion?
						var children = rApp.get('theLegend['+index1+'].z');
						if (children.length === 0)
							return;

							// First extract it
						rApp.pop('theLegend['+index1+'].z', 0, 1).then(function(popped) {
								// Add to top?
							if (modalDialog.get('up') === 'yes') {
									// Add empty children array
								popped.z = [];
								rApp.push('theLegend', popped).then(function() { doNextChild(); });
							} else {
								rApp.push('theLegend['+newIndex+'].z', popped).then(function() {
									doNextChild();
								})
							}
						});
					} // doNextChild

						// Begin recursion
					doNextChild();
					modalDialog.teardown();
				}); // OK
				modalDialog.on('dialog.cancel', modalDialog.teardown);
			} // has children
		} // top-level parent
		return false;
	}); // on doVocabMove


	rApp.on('doLegendEdit', function(event, index) {
		var origEntry = rApp.get('theLegend['+index+']');	// original Legend entry
		var editDialog;
		var editBlob = { };

			// Create dialog to edit values
		switch (rApp.get('theAttribute.t')) {
		case 'T':
			editBlob.label = origEntry.l;
			editBlob.pattern = origEntry.val;
			editDialog = createEditDialog('#dialog-legend-text', editBlob);
			break;
		case 'N':
			editBlob.label = origEntry.l;
			editBlob.min = origEntry.d.min;
			editBlob.max = origEntry.d.max;
			editDialog = createEditDialog('#dialog-legend-number', editBlob);
			break;
		case 'D':
			editBlob.label = origEntry.l;
			editBlob.min = { y: origEntry.d.min.y, m: origEntry.d.min.m, d: origEntry.d.min.d };
			editBlob.max = { y: origEntry.d.max.y, m: origEntry.d.max.m, d: origEntry.d.max.d };
			editDialog = createEditDialog('#dialog-legend-dates', editBlob);
			break;
		} // switch

			// Intercept Save on it
		editDialog.on('dialog.ok', function(evt) {
			var newEntry = extractLegendEntry(editDialog);
			newEntry.v   = origEntry.v;
			rApp.set('theLegend['+index+']', newEntry);
			editDialog.teardown();
			return false;
		});
		editDialog.on('dialog.cancel', editDialog.teardown);
		return false;
	}); // on doLegendEdit

		// PURPOSE: Select color for Legend Entry
		// INPUT: index2 = undefined if top-level parent
	rApp.on('doLegendViz', function(event, index1, index2) {
		var secondary = typeof(index2) !== 'undefined';
		var lgndIndex = 'theLegend['+index1+']';
		var removeViz = false;
		if (secondary) {
			lgndIndex += '.z['+index2+']';
		}
		var theColor = rApp.get(lgndIndex+'.v');
		if (theColor.length == 0 || theColor.charAt(0) !== '#')
			theColor = '#888888';
		var colorPicker;
		colorPicker = new Ractive({
			el: '#att-insert-dialog',
			template: secondary ? '#dialog-choose-color-clear' : '#dialog-choose-color',
			data: {
				doClear: removeViz,
				color: theColor
			},
			components: {
				dialog: RJDialogComponent,
				iris: RJIrisColor
			}
		}); // new Ractive()
		colorPicker.on('dialog.ok', function(evt) {
			var finalColor = colorPicker.get('color');
			if (colorPicker.get('doClear')) {
				rApp.set(lgndIndex+'.v', '');
			} else {
				rApp.set(lgndIndex+'.v', finalColor);
			}
			colorPicker.teardown();
		});
		colorPicker.on('dialog.cancel', colorPicker.teardown);
		return false;
	});

		// INPUT: index2 = undefined if top-level parent
	rApp.on('doLegendUp', function(event, index1, index2) {
			// Parent-level
		if (typeof(index2) === 'undefined') {
			if (index1) {
				rApp.splice('theLegend', index1, 1).then(function(spliced) {
					rApp.splice('theLegend', index1-1, 0, spliced[0]);
				});
			}
		} else {
			if (index2) {
				parent = 'theLegend['+index1+'].z';
				rApp.splice(parent, index2, 1).then(function(spliced) {
					rApp.splice(parent, index2-1, 0, spliced[0]);
				});
			}
		}
		return false;
	}); // on doLegendUp

		// INPUT: index2 = undefined if top-level parent
	rApp.on('doLegendTop', function(event, index1, index2) {
			// Parent-level
		if (typeof(index2) === 'undefined') {
			if (index1) {
				rApp.splice('theLegend', index1, 1).then(function(spliced) {
					rApp.splice('theLegend', 0, 0, spliced[0]);
				});
			}
		} else {
			if (index2) {
				var parent = 'theLegend['+index1+'].z';
				rApp.splice(parent, index2, 1).then(function(spliced) {
					rApp.splice(parent, 0, 0, spliced[0]);
				});
			}
		}
		return false;
	}); // on doLegendUp

		// INPUT: index2 = undefined if top-level parent
	rApp.on('doLegendDown', function(event, index1, index2) {
			// Parent-level
		if (typeof(index2) === 'undefined') {
			var leg = rApp.get('theLegend');
				// Don't allow for bottom-most
			if (index1 < (leg.length-1)) {
				rApp.splice('theLegend', index1, 1).then(function(spliced) {
					rApp.splice('theLegend', index1+1, 0, spliced[0]);
				});
			}
		} else {
			var parent = 'theLegend['+index1+'].z';
			var leg = rApp.get(parent);
				// Don't allow for bottom-most
			if (index2 < (leg.length-1)) {
				rApp.splice(parent, index2, 1).then(function(spliced) {
					rApp.splice(parent, index2+1, 0, spliced[0]);
				});
			}				
		}
		return false;
	}); // on doLegendDown

		// INPUT: index2 = undefined if top-level parent
	rApp.on('doLegendBottom', function(event, index1, index2) {
			// Parent-level
		if (typeof(index2) === 'undefined') {
			var leg = rApp.get('theLegend');
				// Don't allow for bottom-most
			if (index1 < (leg.length-1)) {
				rApp.splice('theLegend', index1, 1).then(function(spliced) {
					rApp.push('theLegend', spliced[0]);
				});
			}
		} else {
			var parent = 'theLegend['+index1+'].z';
			var leg = rApp.get(parent);
				// Don't allow for bottom-most
			if (index2 < (leg.length-1)) {
				rApp.splice(parent, index2, 1).then(function(spliced) {
					rApp.push(parent, spliced[0]);
				});
			}
		}
		return false;
	}); // on doLegendUp

		// INPUT: index2 = undefined if top-level parent
	rApp.on('doLegendDel', function(event, index1, index2) {
		confirmModal('#msg-confirm-del-vocab', function() {
			if (typeof(index2) === 'undefined') {
				rApp.splice('theLegend', index1, 1);
			} else {
				rApp.splice('theLegend['+index1+'].z', index2, 1);
			}
		});
		return false;
	});

	rApp.on('setUColor', function() {
		var colorPicker;
		colorPicker = new Ractive({
			el: '#att-insert-dialog',
			template: '#dialog-choose-color',
			data: {
				color: rApp.get('theRange.u')
			},
			components: {
				dialog: RJDialogComponent,
				iris: RJIrisColor
			}
		}); // new Ractive()
		colorPicker.on('dialog.ok', function(evt) {
			var finalColor = colorPicker.get('color');
			rApp.set('theRange.u', finalColor);
			colorPicker.teardown();
		});
		colorPicker.on('dialog.cancel', colorPicker.teardown);
		return false;
	});

		// Use chosen custom field
	rApp.on('copyCF', function() {
		rApp.set('attID', rApp.get('chosenCF'));
		return false;
	});

	rApp.on('addTerms', function() {
			// Has custom field been specified?
		var theAttID = rApp.get('attID');
		if (theAttID.length == 0) {
			displayError('#errmsg-no-custom-field');
			return false;
		}
		confirmModal('#msg-confirm-add-vocab', function()
		{
			var delim = rApp.get('theAttribute.d');

			jQuery.ajax({
				type: 'POST',
				url: prspdata.ajax_url,
				data: {
					action: 'prsp_get_cf_vals',
					att_id: theAttID,
					delim: delim
				},
				success: function(data, textStatus, XMLHttpRequest)
				{
					var cfTerms = JSON.parse(data);
					var legend = rApp.get('theLegend');

					cfTerms.forEach(function(name) {
						var found=false;
						for (var i=0; i<legend.length; i++) {
							var lItem = legend[i];
							if (lItem.l == name)
								found=true;
							else {
								for (var j=0; j<lItem.z.length; j++)
									if (lItem.z[j].l == name) {
										found=true;
										break;
									}
							}
							if (found)
								break;
						}
						if (!found)
							legend.push({ l: name, v: '#888888', z: [] });
					});
					rApp.set('theLegend', legend);
				},
				error: function(XMLHttpRequest, textStatus, errorThrown)
				{
				   alert(errorThrown);
				}
			}); // jQuery.ajax
		}); // confirmModal
		return false;
	});

		// User asked for values to be saved
	rApp.on('saveAttribute', function() {
		var attDef = doErrorCheck();
		if (attDef) {
			var error;
			var attR = { };
			var attL = [ ];

			switch(attDef.t) {
			case 'V':
				var legend = rApp.get('theLegend');
				_.forEach(legend, function(parent) {
					var newParent = { };
					newParent.l = parent.l;
					newParent.v = parent.v;
					newParent.z = [];
					if (parent.z.length) {
						_.forEach(parent.z, function(child) {
							var newChild = { };
							newChild.l = child.l;
							newChild.v = child.v.length ? child.v : null;
							newParent.z.push(newChild);
						})
					}
					attL.push(newParent);
				});
				break;

			case 'T':
				var legend = rApp.get('theLegend');
				_.forEach(legend, function(entry) {
					var newEntry = { };
					newEntry.l = entry.l;
					newEntry.d = entry.d;
					newEntry.v = entry.v;
					attL.push(newEntry);
				});
				break;

			case 'N':
				var minN = rApp.get('theRange.min');
				var maxN = rApp.get('theRange.max');
					// Allow one but not both to be empty
				if (minN.length == 0 && maxN.length == 0) {
					displayError('#errmsg-num-need-bound');
					return;
				}
					// Convert range to Numbers
				if (minN.length) {
					attR.min = parseInt(minN, 10);
					if (!_.isFinite(attR.min)) {
						displayError('#errmsg-range-not-valid');
						return;
					}
				}
				if (maxN.length) {
					attR.max = parseInt(maxN, 10);
					if (!_.isFinite(attR.max)) {
						displayError('#errmsg-range-not-valid');
						return;
					}
				}
				attR.g = rApp.get('theRange.g');

				if (rApp.get('theRange.useU') == true)
					attR.u = rApp.get('theRange.u');

				var legend = rApp.get('theLegend');
				_.forEach(legend, function(entry) {
					var newEntry = { };
					newEntry.l = entry.l;
					newEntry.v = entry.v;
					newEntry.d = { };
					if (entry.d.min.length) newEntry.d.min = parseInt(entry.d.min, 10);
					if (entry.d.max.length) newEntry.d.max = parseInt(entry.d.max, 10);
					if (entry.d.min > entry.d.max) {
						error = '#errmsg-num-range-inverted';
					}
					attL.push(newEntry);
				});
				break;

			case 'D':
				attR.min = { }; attR.max = { };
				attR.g = rApp.get('theRange.g');
					// minimum Date
				var y = rApp.get('theRange.min.y');
				if (y.length == 0) {
					displayError('#errmsg-no-min-date');
					return;
				}
				attR.min.y = parseInt(y, 10);
				if (!_.isFinite(attR.min.y)) {
					displayError('#errmsg-no-min-date');
					return;
				}
				var m = rApp.get('theRange.min.m');
				var d;
				if (m.length) {
					attR.min.m = parseInt(m, 10);
					if (!_.isFinite(attR.min.m) || (attR.min.m < 1) || (attR.min.m > 12)) {
						displayError('#errmsg-bad-month');
						return;
					}
					d = rApp.get('theRange.min.d');
					if (d.length) {
						attR.min.d = parseInt(d, 10);
						if (!_.isFinite(attR.min.d) || (attR.min.d < 1) || (attR.min.m > 31)) {
							displayError('#errmsg-bad-day');
							return;
						}
					}
				}
					// maximum Date
				y = rApp.get('theRange.max.y');
				if (y.length) {
					attR.max.y = parseInt(y, 10);
					if (!_.isFinite(attR.min.y)) {
						displayError('#errmsg-no-min-date');
						return;
					}
					m = rApp.get('theRange.max.m');
					if (m.length) {
						attR.max.m = parseInt(m, 10);
						if (!_.isFinite(attR.max.m) || (attR.max.m < 1) || (attR.max.m > 12)) {
							displayError('#errmsg-bad-month');
							return;
						}
						d = rApp.get('theRange.max.d');
						if (d.length) {
							attR.max.d = parseInt(d, 10);
							if (!_.isFinite(attR.max.d) || (attR.max.d < 1) || (attR.max.d > 31)) {
								displayError('#errmsg-bad-day');
								return;
							}
						}
					}
				}

				if (rApp.get('theRange.useU') == true) {
					attR.u = rApp.get('theRange.u');
				}

					// Compile Date Legend
				var legend = rApp.get('theLegend');
				_.forEach(legend, function(entry) {
					var newEntry = { };
					newEntry.l = entry.l;
					newEntry.v = entry.v;
					newEntry.d = { min: {}, max: {} };
					if (entry.d.min.y.length) {
						newEntry.d.min.y = parseInt(entry.d.min.y, 10);
						if (!_.isFinite(newEntry.d.min.y)) {
							error = '#errmsg-bad-year';
						}
						if (entry.d.min.m.length) {
							newEntry.d.min.m = parseInt(entry.d.min.m, 10);
							if (!_.isFinite(newEntry.d.min.m) || (entry.d.min.m < 1) || (entry.d.min.m > 12)) {
								error = '#errmsg-bad-month';
							}
							if (entry.d.min.d.length) {
								newEntry.d.min.d = parseInt(entry.d.min.d, 10);
								if (!_.isFinite(newEntry.d.min.d) || (entry.d.min.d < 1) || (entry.d.min.d > 31)) {
									error = '#errmsg-bad-day';
								}
							}
						}
					}
					if (entry.d.max.y.length) {
						newEntry.d.max.y = parseInt(entry.d.max.y, 10);
						if (!_.isFinite(newEntry.d.max.y)) {
							error = '#errmsg-bad-year';
						}
						if (entry.d.max.m.length) {
							newEntry.d.max.m = parseInt(entry.d.max.m, 10);
							if (!_.isFinite(newEntry.d.max.m) || (entry.d.max.m < 1) || (entry.d.max.m > 12)) {
								error = '#errmsg-bad-month';
							}
							if (entry.d.max.d.length) {
								newEntry.d.max.d = parseInt(entry.d.max.d, 10);
								if (!_.isFinite(newEntry.d.max.d) || (entry.d.max.d < 1) || (entry.d.max.d > 31)) {
									error = '#errmsg-bad-day';
								}
							}
						}
					}
					if (typeof(newEntry.d.min.y) == "undefined" && typeof(newEntry.d.max.y) == "undefined")
					{
						error = "#errmsg-date-no-bound";
					}
					if (newEntry.d.min.y > newEntry.d.max.y)
					{
						error = "#errmsg-date-range-inverted";
					}
					attL.push(newEntry);
				}); // forEach
					// Abort here if any errors signalled
				if (error) {
					displayError(error);
					return false;
				}
				break;
			} // switch

				// Stuff in hidden fields
			var theID = rApp.get('attID').trim();
			jQuery('input[name="prsp_att_id"]').val(theID);
			var pSetting = rApp.get('privacy');
			jQuery('textarea[name="prsp_att_privacy"]').val(pSetting);
			jQuery('textarea[name="prsp_att_def"]').val(JSON.stringify(attDef));
			jQuery('textarea[name="prsp_att_r"]').val(JSON.stringify(attR));
			jQuery('textarea[name="prsp_att_lgnd"]').val(JSON.stringify(attL));
				// Confirm Attribute data saved to user
			displayError('#msg-saved', true);
		} // if no error
		return false;
	}); // on saveAttribute

}); // ready
