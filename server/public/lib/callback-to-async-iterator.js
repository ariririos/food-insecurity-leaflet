'use strict';

/**
 * Module based on callback-to-async-iterator (credit: https://www.npmjs.com/package/callback-to-async-iterator)
 * Modified slightly to end iteration at end of collection, function signature now:
 *  asyncify((cb, done) => ev.on('event', cb).on('done', done))
 * Author: Cristian Rios (rioc0719@) <cristian.rios0719@gmail.com>
 */


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _iterall = require('iterall');

const defaultOnError = err => {
  throw new Error(err);
};
// Turn a callback-based listener into an async iterator
// Based on https://github.com/apollographql/graphql-subscriptions/blob/master/src/event-emitter-to-async-iterator.ts


function callbackToAsyncIterator(listener, options = {}) {
  var _options$onError = options.onError;
  const onError = _options$onError === undefined ? defaultOnError : _options$onError;
  var _options$buffering = options.buffering;
  const buffering = _options$buffering === undefined ? true : _options$buffering,
        onClose = options.onClose;

  try {
    let pullQueue = [];
    let pushQueue = [];
    let listening = true;
    let listenerReturnValue;
    // Start listener
    listener(value => { pushValue(value) }, () => { pushValue(null); }).then(a => {
      listenerReturnValue = a;
    }).catch(err => {
      onError(err);
    });

    const pushValue = (value) =>  {
      if (pullQueue.length !== 0) {
        pullQueue.shift()({ value: value || undefined, done: value ? false : true });
      } else if (buffering === true) {
        pushQueue.push(value);
      }
    }

    const pullValue = () => {
      return new Promise(resolve => {
        if (pushQueue.length !== 0) {
          const nextValue = pushQueue.shift();
          if (nextValue !== null) {
            resolve({ value: nextValue, done: false });
          }
          else {
            listening = false;
            resolve({ value: undefined, done: true })
          }
        } else {
          pullQueue.push(resolve);
        }
      });
    }

    const emptyQueue = () => {
      if (listening) {
        listening = false;
        pullQueue.forEach(resolve => resolve({ value: undefined, done: true }));
        pullQueue = [];
        pushQueue = [];
        onClose && onClose(listenerReturnValue);
      }
    }

    return {
      next() {
        return listening ? pullValue() : this.return();
      },
      return() {
        emptyQueue();
        return Promise.resolve({ value: undefined, done: true });
      },
      throw(error) {
        emptyQueue();
        onError(error);
        return Promise.reject(error);
      },
      [_iterall.$$asyncIterator]() {
        return this;
      }
    };
  } catch (err) {
    onError(err);
    return {
      next() {
        return Promise.reject(err);
      },
      return() {
        return Promise.reject(err);
      },
      throw(error) {
        return Promise.reject(error);
      },
      [_iterall.$$asyncIterator]() {
        return this;
      }
    };
  }
}

exports.default = callbackToAsyncIterator;