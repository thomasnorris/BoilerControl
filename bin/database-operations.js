
var _fs = require('fs'),
	_csvWriter = require('csv-write-stream');

const DATA_PATH = __dirname + '/data/';
const DB_FILE_NAME = 'Data.json';
const DB_FILE_PATH = DATA_PATH + DB_FILE_NAME;
const CSV_FILE_NAME = 'Data.csv';
const CSV_FILE_PATH = DATA_PATH + CSV_FILE_NAME;

var _data;
var _headers;

module.exports = {
	LoadDatabase: function(constList, callback) {
		_fs.exists(DB_FILE_PATH, (exists) => {
			if (!exists) {
				console.log(DB_FILE_NAME + ' does not exist, creating...');
				_fs.openSync(DB_FILE_PATH, 'w');
				_fs.openSync(CSV_FILE_PATH, 'w');

				var tempData = {};
				Object.keys(constList).forEach((key) => {
					tempData[constList[key]] = [];
				});

				CreateNewCsv(tempData);
				module.exports.WriteToFiles(tempData);
			}
			_data = module.exports.ReadDataBase();
			_headers = Object.keys(_data);
			callback();
			console.log('Loaded ' + DB_FILE_NAME + ' successfully.');
		});
		function CreateNewCsv(data) {
			var tempHeaders = [];
			var csvData = [];
			Object.keys(data).forEach((key) => {
				tempHeaders.push(key);
				csvData.push([]);
			});
			var writer = _csvWriter({ headers: tempHeaders })
			writer.pipe(_fs.createWriteStream(CSV_FILE_PATH));
			writer.write(csvData);
			writer.end();
		}
	},
	WriteToFiles: function(data) {
		_fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, '\t'));
		var csvData = {};
		Object.keys(data).forEach((key) => {
			csvData[key] = data[key][data[key].length - 1];
		});
		var csvWriter = _csvWriter({ sendHeaders: false });
		csvWriter.pipe(_fs.createWriteStream(CSV_FILE_PATH, { flags: 'a' }));
		csvWriter.write(csvData);
		csvWriter.end();
	},
	AddToDatabase: function(newData) {
		for (var i = 0; i < newData.length; i++) {
			_data[_headers[i]].push(newData[i]);
		}
		module.exports.WriteToFiles(_data);
		_data = module.exports.ReadDataBase();
	},
	ReadDataBase: function() {
		return JSON.parse(_fs.readFileSync(DB_FILE_PATH))
	}
}
