const got = require('got');
const chalk = require('chalk');
const config = require('loke-config').create('ptvmqtt');

const active = config.get('active');
const watch = config.get('watch');

watch.forEach(w => {
  const url = w.url;
  const thresholds = w.thresholds;
  const startTrackingThreshold = thresholds[0];

  const tracking = {};

  const isNotTracking = (departure) => !(departure.run_id in tracking);
  const shouldStartTracking = (departure) => !(departure.run_id in tracking);
  const nextThreshold = (current) => (current +1 >= thresholds.length) ? null : thresholds[current + 1];

  const intervalFn = () => {
    got(url, { json: true })
    .then(response => response.body.departures)
    .then(dateifyDepartures)
    .then(departures => {
      console.log(new Date(), `Tracking ${Object.keys(tracking).length} runs`);

      Object.keys(tracking).forEach(runIdStr => {
        const runId = parseInt(runIdStr);
        const departure = departures.find(d => d.run_id === runId);

        if (!departure) {
          console.log('DBG', 'Deleting ' + runIdStr);
          delete tracking[runIdStr];
          return;
        }

        const tracker = tracking[runIdStr];
        const lastMins = tracker.mins;
        tracker.mins = departure.estimated_departure_mins;

        const next = nextThreshold(tracker.threshold);

        console.log('DBG', departure.run_id, tracker.mins < next.mins, tracker.mins, next.mins)
        if (tracker.mins < next.mins) {
          // threshold crossed
          tracker.threshold++;
          sendAlert(next.level, tracker.mins, departure.run_id, next);
        }
      });

      const startTracking = departures.filter(isNotTracking)
      .filter(d => d.estimated_departure_mins < startTrackingThreshold.mins)
      .forEach(d => {
        tracking[d.run_id] = {
          mins: d.estimated_departure_mins,
          threshold: 0
        };
        sendAlert(startTrackingThreshold.level, d.estimated_departure_mins, d.run_id, thresholds[0]);
      });

    });
  };
  setInterval(intervalFn, 60000);
  intervalFn();
});

function dateifyDepartures(departures) {
  const now = new Date();
  departures.forEach(d => {
    d.estimated_departure = d.estimated_departure_utc
      ? new Date(d.estimated_departure_utc)
      : null;
    d.scheduled_departure = d.scheduled_departure_utc
      ? new Date(d.scheduled_departure_utc)
      : null;

    if (d.estimated_departure) {
      d.estimated_departure_mins = (d.estimated_departure.getTime() - now.getTime()) / 1000 / 60;
    }
  });

  return departures;
}

function sendAlert(level, mins, runId, threshold) {
  console.log(new Date() + ' ' + chalk.red('ALERT'), level, mins.toFixed(1) + 'mins', runId, threshold.mins);
}
