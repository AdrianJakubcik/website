// this is the build script
// it takes files from source/ and transpiles them into build/
// it takes components from components/ and substitutes them into all .html
//  files that use the handlebar syntax of {{ ... }}
// components can also use this syntax {{ ... }} to place other components inside
//  referred to as 'nested' components
// all non-html files are simply copied

// this program actually transpiles twice, creating two copies of html files, 
//  once using english components and a second time using slovak components
// slovak components are those placed in the components/sk/ folder and 
//  components/en/ for english
// both transpilations can use the shared components inside components/

// components can be 'compound' if they use the appropriate syntax (defined below)
// this acts as if you had multiple components, but put into one file
//  and accessed using {{component.subcomponent}}

class InterviewCard {

	constructor(image, title, quickinfo, longdesc, pathToPhotosFolderFromWebRoot, student) {
		this.image = image;
		this.title = title;
		this.student = student;
		this.quickinfo = quickinfo;
		this.longdesc = longdesc;
		this.path = pathToPhotosFolderFromWebRoot;
		this.photos = [];
		
		var succ = this._getPhotos();
		if(!succ)
			console.error("Missing photos in folder for " + this.image.split('/').pop() + " interview card");
		//console.log("Oject initialized!");
	}

	_getPhotos() {
		try {
		var files = fs.readdirSync(getDirname() + '/source/' + this.path)
			if (files.length < 1)
				return false;
			files.forEach(file => {
				var ext = getFileExtension(file);
				if (ext === "jpg" || ext === "png" || ext === "svg") {
					var src = (this.path + file);
					var name = file.split('.')[0];
					var photo = { name: name, source: src };
					this.photos.push(photo);
				}
			});
		return true;
		} catch (error) {
			console.log(error);
			return false;	
		}
	}

	getCode() {
		return `
		<div id="${this.student.replace(' ', '_')}" class="card interview">
			<img class="card-img-top" src="{fill_parents}${this.image}" alt="Photo">
			<h4 class="card-title">${this.title}</h4>
			<div class="card-body">
				<h5 class="card-subtitle">${this.student}</h5>
				<div class="card-text">
					<p class="card-text">${this.quickinfo}</p>
					<p class="card-text card-long-desc no-display">${this.longdesc}</p>
				</div>
				<h2 class="no-display">Gallery</h2>
				<ul class="card-images no-display">
					${this.photos.map(photo =>`<li class="card-photo">
						<img src="{fill_parents}${photo.source}" alt="${photo.name}">
					</li>`).join('')}
				</ul>
			</div>
		</div>`;
	}
}

const fs = require('fs') // for manipulation of files
const glob = require('glob') // for finding the right files
const Handlebars = require('handlebars') // for using handlebars

// syntax for compound components
const OPENING_SIGNATURE = ':^) ' // notice the space on end
const CLOSING_SIGNATURE = ' :::' // notice the space in front

// getter function for directory name
function getDirname () {
	// replaces backwards slashes with forward slashes (Windows patch)
	return __dirname.replace(/\\/g, '/')
}

// it's basically the old file with /source/ replaced with /build/
function getBuildFilePathFromSourceFilePath (sourceFilePath) {
	// note that replace only replaces the first occurrence if the first argument
	//  is a string
	return sourceFilePath.replace(
		getDirname() + '/source/',
		getDirname() + '/build/'
	)
}

function getFileExtension (filePath) {
	return filePath.split('.').pop()
}

function isHtmlFile (filePath) {
	return getFileExtension(filePath) === 'html'
}

function isCssFile (filePath) {
	return getFileExtension(filePath) === 'css'
}

function isJsonFile(filePath) {
	return getFileExtension(filePath) === 'json'
}

function makeFolder (folderPath) {
	 //console.log('Preparing folder', folderPath)
	// create if it doesn't exists yet
	if (!fs.existsSync(folderPath)) {
		fs.mkdirSync(folderPath)
		//console.log('Created folder', folderPath)
	}
}

// creates a dictionary of (filename: sourceFile) for Handlebars
function makeComponentDictionary(globPattern) {
	//console.log('Looking for components matching: ' + globPattern)

	const componentSourceFiles = glob.sync(globPattern)
	const components = {}
	// loop over found components matching the glob pattern
	for (const componentSourceFile of componentSourceFiles) {
		const componentName = componentSourceFile
			.split('/').pop() // get the actual filename
			.replace(/\.html$/, '') // remove .html at the end
	
		//console.log('Found component', componentName)

		// parse component (separate into subcomponents if it is compound)
		const fileString = fs.readFileSync(componentSourceFile, "utf8")
		if (fileString.indexOf(OPENING_SIGNATURE) == 0) {
			//console.log(componentName, 'was identified as a compound component')

			// split by sections / subcomponents
			let sections = fileString.split('\r\n' + OPENING_SIGNATURE)
			sections[0] = sections[0].replace(OPENING_SIGNATURE, '')
			// separate sections into name and content
			sections = sections.map(section => section.split(CLOSING_SIGNATURE + '\r\n'))
			// add component sections to dictionary
			let componentDict = {}
			sections.forEach(
				section => {
					componentDict[section[0]] = new Handlebars.SafeString(section[1])
				}
			)
			// add compound component to main component dictionary
			components[componentName] = componentDict
		}
		else {
			// otherwise if not compound, just add them normally

			// Handlebars escapes the '<' and '>' characters by default, so we need to
			// explain that the strings are safe
			// API reference: http://handlebarsjs.com/reference.html
			components[componentName] = new Handlebars.SafeString(fileString)
		}
		
	}
	return components
}

function transpileUsingNestedHandlebars(fileString, fileToCreate, components) {
	// this is where we transpile!
	// https://github.com/wycats/handlebars.js/#usage
	let template

	// repeated Handlebar replacement to allow for nesting
	while (fileString.indexOf('{{') !== -1) {
		template = Handlebars.compile(fileString)
		fileString = template(components)
	}
	// write output to file
	fileString = autoFillParentFolders(fileToCreate, fileString);
	fileString = languageFillPath(fileToCreate, fileString);
	fs.writeFileSync(fileToCreate, fileString)
}

/** Identifies and auto-fills parent folders
 * 
 * @param {String} filepath Path to file where the component is located
 * @param {*} file_content Content of the file
 * @returns {String} The string with filled placeholders
 */
function autoFillParentFolders(filepath, file_content) {
	var path = filepath;
	while(file_content.indexOf('{fill_parents}') != -1) {
		file_content = file_content.replace('{fill_parents}', joinRepeatedString(getNumberOfParentFolders(path,'build') - 1,'../'));
	}
	while(file_content.indexOf('{fill_parents_html}') != -1) {
		file_content = file_content.replace('{fill_parents_html}', joinRepeatedString(getNumberOfParentFolders(path,'html') - 1,'../'));
	}
	// console.log("Parent Folders AutoFill Complete On The File: " + path);
	return file_content;
}

/** Returns string where language href(url) are replaced with appropriate links
 * 
 * @param {String} filepath Path to file where the component is located
 * @param {*} file_content Content of the file
 * @returns Returns the file content with transpiled components
 */
function languageFillPath(filepath, file_content) {
	while(file_content.indexOf('{language_src}') != -1) {
		file_content = file_content.replace('{language_src}', joinPathofFile(filepath));
	}
	return file_content;
}

/** Joins together the same string x number of times
 * 
 * @param {Number} multiplier Number how many times the pattern is to be repeated
 * @param {String} pattern The pattern to be repeatedly joined 
 * @returns {String} A joined string of the pattern
 */
function joinRepeatedString(multiplier, pattern) {
	var string_builder = "";
	for(var i = 0; (i + 1) <= multiplier; i++){
		string_builder += pattern;
	}
	//console.log(string_builder);
	return string_builder;
}

/** Returns the relative url of the file in different language folder
 * 
 * @param {String} filepath Path to file where the component is located
 * @returns {String} The relative url of the same file in different language
 */
function joinPathofFile(filepath) {
	if(getNumberOfParentFolders(filepath) == 0)
		return;
	var string_builder = joinRepeatedString(getNumberOfParentFolders(filepath) - 1, '../');
	var path_parts = filepath.split('html/')[1];
	//console.log("Path Parts:" + path_parts);
	if(path_parts.indexOf('en/') != -1)
		string_builder += path_parts.replace('en/','sk/');
	else
		string_builder += path_parts.replace('sk/', 'en/');
	//console.log("File Path:"+filepath+"\nBuilt String:"+string_builder);
	return string_builder;
}

/** Get the number of parent folders from the "Root" of HTML files
 *  
 * @param {String} path Path of the file 
 * @param {String} root 
 * @returns {Number} Number of parent folders from root 
 */
function getNumberOfParentFolders(path, root = "html") {
	var parsed = path.split(root + '/');
	var counter = 0;
	if(parsed[1]) {
		var parsed_even_more = parsed[1].split('/');
		counter = parsed_even_more.length;
		//console.log(parsed[1] + " number of parents: " + parsed_even_more.length);
	}
	return counter;
}
/**
 * 
 * @param {Array} obj 
 */
function transpileInterviewNavigation(objects) {
	// console.log(objects); 
	// return;
	str_builder = ``;
	objects.map(obj => {
		str_builder += `<li id="${obj.Name.replace(" ", "_")}_menu" class="nav-elem"><div>${obj.Name}</div></li>\n`;		
	});
	return str_builder;
}

function transpileJsonInterviewCardsToHTML(enJson, skJson) {
	var file;
	var dir = getDirname() + "/components/";
	var langs = [];
	var files = [];
	var card_deck_start = `
	<div class="card-deck interview">`;
	var card_deck_end = `
	</div>`;

	if (!enJson || enJson == "") { file = skJson.split('/').pop().split('.')[0] + ".html"; langs.push('sk'); }
	else if (!skJson || skJson == "") { file = enJson.split('/').pop().split('.')[0] + ".html"; langs.push('en'); }
	else { file = enJson.split('/').pop().split('.')[0] + ".html"; langs.push('sk'); langs.push('en'); }

	langs.map(lang => {
		var obj = {
			language: lang,
			src: dir+lang+"/"+file
		};
		files.push(obj);
	});

	
	if(langs.includes('en'))
		var obj_en = JSON.parse(fs.readFileSync(enJson));
	if(langs.includes('sk'))
		var obj_sk = JSON.parse(fs.readFileSync(skJson));

	fs.writeFileSync(getDirname() + "/components/" + "interview_navigation.html", transpileInterviewNavigation(obj_en)); 
	
	if(obj_en) {
		var str_builder = ``;
		var counter = 0;
		obj_en.map(obj => {
			if(counter === 0)
				str_builder += card_deck_start;
			var card = new InterviewCard(obj.Image, obj.Title, obj.ShortInfo, obj.LongInfo, obj.PhotosFolderPath, obj.Name);
			//console.log(card);
			str_builder += card.getCode();
			counter++;
			if(counter === 3) {
				str_builder += card_deck_end;
				counter = 0;
			}
		});
		if(counter !== 0) {
			str_builder += card_deck_end;
			counter = 0;
		}
		//console.log(str_builder);
		var file = files.find(obj => {
			return obj.language === 'en';
		});
		fs.writeFileSync(file.src, str_builder);
		//console.log(counter);
	}
	if(obj_sk) {
		var str_builder = ``;
		var counter = 0;
		obj_en.map(obj => {
			if(counter === 0)
				str_builder += card_deck_start;
			var card = new InterviewCard(obj.Image, obj.Title, obj.ShortInfo, obj.LongInfo, obj.PhotosFolderPath, obj.Name);
			//console.log(card);
			str_builder += card.getCode();
			counter++;
			if(counter === 3) {
				str_builder += card_deck_end;
				counter = 0;
			}
		});
		if(counter !== 0) {
			str_builder += card_deck_end;
			counter = 0;
		}
		var file = files.find(obj => {
			return obj.language === 'sk';
		});
		fs.writeFileSync(file.src, str_builder);
		//console.log(counter);
	}
}

// first we prepare all the folders in the build folder
// create the target build/ folder if it doesn't exist yet
makeFolder('./build/')
// create base html folders (en/sk versions)
makeFolder(getDirname() + '/build/html/')
makeFolder(getDirname() + '/build/html/en/')
makeFolder(getDirname() + '/build/html/sk/')
// the remaining folders are not hardcoded,
//  they are added as they are found in source/
const sourceFolders = glob.sync(getDirname() + '/source/**/', {})
for (const sourceFolder of sourceFolders) {

	// checks if the source folder is in the html folder
	if (sourceFolder.includes('/html/')) {
		// create en and sk copies of the folder
		const enFolderToCreate = sourceFolder.replace(
			getDirname() + '/source/html/',
			getDirname() + '/build/html/en/'
		)
		const skFolderToCreate = sourceFolder.replace(
			getDirname() + '/source/html/',
			getDirname() + '/build/html/sk/'
		)
		makeFolder(enFolderToCreate)
		makeFolder(skFolderToCreate)

	} else {
		// otherwise just make one shared folder (e.g. css/ or js/)
		const folderToCreate = getBuildFilePathFromSourceFilePath(sourceFolder)
		makeFolder(folderToCreate)
	}
}

const enJson = glob.sync(getDirname() + '/components/en/interview_cards.json', {}).toString();
const skJson = glob.sync(getDirname() + '/components/sk/interview_cards.json', {}).toString();
transpileJsonInterviewCardsToHTML(enJson, skJson);
// second, we prepare all components
const enComponents = makeComponentDictionary(getDirname() + '/components/{*,en/*}.html')
const skComponents = makeComponentDictionary(getDirname() + '/components/{*,sk/*}.html')
// third, we compose all css files into a single one
console.log('Beginning CSS composition into style.css')
// find all css files inside css folder
const cssSourceFiles = glob.sync(getDirname() + '/source/css/*.css', {})
// turn them into strings
const cssString = cssSourceFiles.map(file => fs.readFileSync(file).toString())
// join all strings into one string
const cssConcatenated = cssString.join('\n')
// TODO: remove whitespace?
// write concatenated string to css file
fs.writeFileSync(getDirname() + '/build/css/style.css', cssConcatenated)
console.log('Composed all CSS files into style.css')
// finally, we transpile html files and copy non-html files
let sourceFiles = glob.sync(getDirname() + '/source/**/*', { nodir: true })
for (const sourceFile of sourceFiles) {
	// identifies the new file to be created
	
	const fileToCreate = getBuildFilePathFromSourceFilePath(sourceFile)
	// note to future contributors: if you're going to use the html folder 
	// for something other than .html files, use filePath.includes('/html/')
	if (isHtmlFile(sourceFile)) {

		// we need a string, so we use .toString()
		const startFile = fs.readFileSync(sourceFile).toString()
		const enFileToCreate = fileToCreate.replace('/html/', '/html/en/')
		const skFileToCreate = fileToCreate.replace('/html/', '/html/sk/')

		// The nested transpilation happens inside a function because
		// it is done twice: once using english components, and then
		// again using slovak components.
		transpileUsingNestedHandlebars(startFile, enFileToCreate, enComponents)
		transpileUsingNestedHandlebars(startFile, skFileToCreate, skComponents)

	} else if (isCssFile(sourceFile)) {
		console.log('Skipped CSS file', sourceFile)

	} else {
		fs.copyFileSync(sourceFile, fileToCreate)
		console.log('Copied file', fileToCreate)
	}
}

console.log('Success! Files built in build/');