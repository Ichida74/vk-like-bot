const params = require('./bot-params.js');
const request = require('request');

// Сalculation of the delay between requests during active hours
const delay = Math.ceil((+(params.enable_hours.length * 60 * 60 / (params.max_wall_requests - 6 * (24 - params.enable_hours.length - params.disable_hours.length))).toFixed(1) + 0.1) * 1000);
let items_cache = [], lastNotificationDate = null;

// First initial app
request({
  method: 'GET',
  url: params.api_url + 'wall.get',
  qs: {
    owner_id: params.group_id,
    count: params.first_initial_count,
    filter: 'owner',
    access_token: params.access_token,
    v: params.api_version,
  }
}, function (error, response, body) {
  if (!error && response.statusCode === 200) {
    let result = JSON.parse(body);
    if ('response' in result) {
      let items = result.response.items;
      for (let item of items) {
        items_cache[item.id] = 1;
      }
    }
    else {
      logError(`Vk like bot: Произошла ошибка при первичном запуске бота: ${body}`);
    }
  }
  else {
    logError('Vk like bot: Произошла ошибка при первичном запуске бота: ' + error ? error : ` Код ответа: ${response.statusCode}`);
  }
});

function getWall() {
  let currentHour = (new Date()).getHours();
  if (!(currentHour in params.disable_hours)) {
    request({
      method: 'GET',
      url: params.api_url + 'wall.get',
      qs: {
        access_token: params.access_token,
        v: params.api_version,
        owner_id: params.group_id,
        filter: 'owner',
        count: params.request_count,
      }
    }, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        let result = JSON.parse(body);
        if ('response' in result) {
          let items = result.response.items;
          for (let item of items) {
            if (!(item.id in items_cache)) {
              likePost(item.id);
            }
          }
        }
        else {
          logError(`Vk like bot: Произошла ошибка при получении списка постов: ${body}`);
        }
      }
      else {
        logError('Vk like bot: Произошла ошибка при получении списка постов: ' + error ? error : ` Код ответа: ${response.statusCode}`);
      }
    });
  }
  calculateTimeout();
}

function likePost(postId) {
  request({
    method: 'GET',
    url: params.api_url + 'likes.add',
    qs: {
      access_token: params.access_token,
      v: params.api_version,
      type: 'post',
      owner_id: params.group_id,
      item_id: postId,
    }
  }, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      let result = JSON.parse(body);
      if ('response' in result && 'likes' in result.response) {
        items_cache[postId] = 1;
        console.log(`Vk like bot: Пост ${postId} отмечен как понравившийся`);
        sendMessageToTelegram(`Vk like bot: Пост ${postId} отмечен как понравившийся`);
      }
      else {
        logError(`Vk like bot: Произошла ошибка при отправке лайка посту ${postId}: ${body}`);
      }
    }
    else {
      logError('Vk like bot: Произошла ошибка при отправке лайка посту: ' + error ? error : ` Код ответа ${response.statusCode}`);
    }
  });
}

function sendMessageToTelegram(message) {
  request({
    method: 'GET',
    url: params.telegram_api_url + 'sendMessage',
    qs: {
      chat_id: params.telegram_chat_id,
      text: message,
    }
  }, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      let result = JSON.parse(body);
      if (!('ok' in result) || result.ok !== true) {
        console.log(`Vk like bot: Произошла ошибка при отправке сообщения в телеграм: ${result}`);
      }
    }
    else {
      let message = error ? error : ` Код ответа: ${response.statusCode}`;
      console.log(`Vk like bot: Произошла ошибка при отправке сообщения в телеграм: ${message}`);
    }
  });
}

function logError(message) {
  console.log(message);
  let now = new Date().getTime();
  if (lastNotificationDate === null || lastNotificationDate + params.telegram_delay < now) {
    lastNotificationDate = now;
    sendMessageToTelegram(message);
  }
}

function calculateTimeout() {
  let now = new Date(),
      nowUnix = now.getTime(),
      nowHour = now.getHours(),
      nextHourUnix = new Date(nowUnix + 60 * 60 * 1000).setMinutes(0, 0, 0),
      localDelay = nextHourUnix - nowUnix + 1000;

  if (params.enable_hours.indexOf(nowHour) !== -1) {
    localDelay = delay;
  }
  else if (params.disable_hours.indexOf(nowHour) === -1) {
    let nextUnixWithDelay = nowUnix + params.not_force_delay, nextHourWithDelay = new Date(nextUnixWithDelay).getHours();
    if (params.enable_hours.indexOf(nextHourWithDelay) === -1)
      localDelay = params.not_force_delay;
  }
  setTimeout(getWall, localDelay);
}

calculateTimeout();
