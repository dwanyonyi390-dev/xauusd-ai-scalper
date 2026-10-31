'use strict';

const { InlineKeyboard } = require('grammy');

function confirmCloseAllKeyboard() {
  return new InlineKeyboard()
    .text('✅ Yes, close all', 'confirm:closeall')
    .text('❌ Cancel', 'cancel:closeall');
}

function emergencyKeyboard() {
  return new InlineKeyboard()
    .text('🚨 CONFIRM EMERGENCY STOP', 'confirm:emergency')
    .text('❌ Cancel', 'cancel:emergency');
}

function settingsKeyboard() {
  return new InlineKeyboard()
    .text('📊 Positions', 'settings:positions')
    .text('💰 Profit', 'settings:profit')
    .text('📉 Risk', 'settings:risk')
    .row()
    .text('⏱ Hold time', 'settings:holdtime')
    .text('📰 News', 'settings:news')
    .row()
    .text('🔙 Close', 'settings:close');
}

module.exports = { confirmCloseAllKeyboard, emergencyKeyboard, settingsKeyboard };