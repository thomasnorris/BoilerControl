
var	blynkLibrary = require('blynk-library'),
	blynkAuth = require('./blynk-auth').getAuth(),
	_blynk = new blynkLibrary.Blynk(blynkAuth),
	_gpio = require('onoff').Gpio,
	_schedule = require('node-schedule'),
	_dbo = require('./database-operations'),
	_dto = require('./date-time-operations');

var	_vPinArr = [],
	_vLedArr = [],
	_manualOverride = new _blynk.VirtualPin(0), 
	_manualColumbia = new _blynk.VirtualPin(1), 
	_manualWell = new _blynk.VirtualPin(2),
	_wellRechargeLevel = new _blynk.VirtualPin(3), 
	_wellRechargeCounter = new _blynk.VirtualPin(4),
	_columbiaTimer = new _blynk.VirtualPin(5),
	_usingColumbiaLed = new _blynk.WidgetLED(6),
	_wellTimer = new _blynk.VirtualPin(7),
	_usingWellLed = new _blynk.WidgetLED(8),
	_cfhCounter = new _blynk.VirtualPin(9),
	_cfhLed = new _blynk.WidgetLED(10),
	_boilerCfgLed = new _blynk.WidgetLED(11);
_vPinArr.push(_manualOverride, _manualWell, _manualColumbia, _wellRechargeLevel); // --No vPins from _mapping
_vLedArr.push(_usingColumbiaLed, _usingWellLed, _cfhLed, _boilerCfgLed); // --All leds

var _gpioArr = [],
	_wellRechargeInput = new _gpio(26, 'in', 'both'),
	_boilerCfgInput = new _gpio(13, 'in', 'both'),
	_cfhInput = new _gpio(6, 'in', 'both'),
	_columbiaValveRelayOutput = new _gpio(4, 'high'),
	_wellValveRelayOutput = new _gpio(17, 'high'),
	_boilerStartRelayOutput = new _gpio(27, 'high');
_gpioArr.push(_columbiaValveRelayOutput, _wellValveRelayOutput, _boilerStartRelayOutput); // --No input gpio

const RECHARGE_TIME_MINUTES = 5;
const RECHARGE_INTERVAL_MILLI = 1000;
const CRON_CSV_WRITE_SCHEDULE = '0 7,19 * * *';
const CRON_ARCHIVE_SCHEDULE = '0 0 * */1 *';

var _mapping = {
	DATE: 'Date',
	WELL_RECHARGE_COUNTER: 'Recharge Counter',
	COLUMBIA_TIMER: 'Columbia Timer',
	WELL_TIMER: 'Well Timer',
	CFH_COUNTER : 'Call For Heat Counter'
}

var _newData;

_blynk.on('connect', () => {
	_dbo.LoadDatabase(_mapping, (recentData) => {
		_newData = recentData;
		InitializeValues();
		BlynkTriggerGpio(_manualColumbia, _columbiaValveRelayOutput);
		BlynkTriggerGpio(_manualWell, _wellValveRelayOutput);
		StartWellRehargeMonitoring();
		StartSchedules();
	});
});

function StartSchedules() {
	_schedule.scheduleJob(CRON_CSV_WRITE_SCHEDULE, () => {
    	_dbo.WriteToCsv();
	});
	_schedule.scheduleJob(CRON_ARCHIVE_SCHEDULE, () => {
		_dbo.CreateArchives();
	});
}

function InitializeValues() {
	_wellRechargeCounter.write(_newData[_mapping.WELL_RECHARGE_COUNTER]);
	_columbiaTimer.write(_dto.MinutesAsHoursMins(_newData[_mapping.COLUMBIA_TIMER]));
	_wellTimer.write(_dto.MinutesAsHoursMins(_newData[_mapping.WELL_TIMER]));
	_cfhCounter.write(_newData[_mapping.CFH_COUNTER]);

	_gpioArr.forEach((gpio) => {
		gpio.writeSync(1);
	});
	_vPinArr.forEach((vPin) => {
		vPin.write(0);
	});
	_vLedArr.forEach((vLed) => {
		vLed.turnOff();
	});
}

function StartWellRehargeMonitoring() {
	var isCfh;
	var isBoilerCfg;

	var interval;
	var chargeInProgress
	_wellRechargeInput.watch((err, value) => {
		clearInterval(interval);
		if (value.toString() == 1 && !chargeInProgress) {
			_wellRechargeLevel.write(0);
			chargeInProgress = true;
			var i = 1;
			interval = setInterval(() => {
				_wellRechargeLevel.write(i);
				if (i == RECHARGE_TIME_MINUTES) {
					_wellRechargeCounter.write(++_newData[_mapping.WELL_RECHARGE_COUNTER]);
					_dbo.AddToDatabase(_newData);
					chargeInProgress = false;
					clearInterval(interval);
				} else 
					i++;
			}, RECHARGE_INTERVAL_MILLI);
		}
	});
	_cfhInput.watch((err, value) => {
		if (value.toString() == 1) {
			isCfh = true;
			TurnRelayAndLedOn(_boilerStartRelayOutput, _cfhLed);
		} else {
			isCfh = false;
			TurnRelayAndLedOff(_boilerStartRelayOutput, _cfhLed);
			_boilerStartRelayOutput.writeSync(1);
			_cfhLed.turnOff();
		} 
	});
	_boilerCfgInput.watch((err, value) => {
		while (value.toString() == 1) {
			isBoilerCfg = true;
			if (!chargeInProgress) {
				TurnRelayAndLedOn(_wellValveRelayOutput, _usingWellLed);
				TurnRelayAndLedOff(_columbiaValveRelayOutput, _usingColumbiaLed);
			} else {
				TurnRelayAndLedOn(_columbiaValveRelayOutput, _usingColumbiaLed);
				TurnRelayAndLedOff(_wellValveRelayOutput, _usingWellLed);
			}
		} 
		isBoilerCfg = false;
	});

	function TurnRelayAndLedOn(relay, led) {
		relay.writeSync(0);
		led.turnOn();
	}

	function TurnRelayAndLedOff(relay, led) {
		relay.writeSync(1);
		led.turnOff();
	}
}

function BlynkTriggerGpio(trigger, gpio) {
	trigger.on('write', (value) => {
		value.toString() == 1 ? gpio.writeSync(0) : gpio.writeSync(1);
	});
}