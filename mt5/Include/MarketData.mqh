// mt5/Include/MarketData.mqh
// Tick + spread helpers. No strategy logic — pure data.

#ifndef __MARKETDATA_MQH__
#define __MARKETDATA_MQH__

#property strict

#include "Logger.mqh"
#include "Configuration.mqh"

class CMarketData
{
private:
   string          m_symbol;
   double          m_point;
   datetime        m_lastTickTime;
   double          m_lastBid;
   double          m_lastAsk;
   MqlTick         m_lastTick;

public:
   CMarketData() : m_symbol(""), m_point(0.0), m_lastTickTime(0), m_lastBid(0.0), m_lastAsk(0.0) {}

   void Init(const SResolvedSymbol &sym)
   {
      m_symbol = sym.broker;
      m_point  = sym.point;
   }

   // Refresh cached tick. Returns false if quote is stale or invalid.
   bool Update()
   {
      MqlTick t;
      if(!SymbolInfoTick(m_symbol, t))
      {
         return false;
      }
      if(t.bid <= 0.0 || t.ask <= 0.0 || t.ask < t.bid)
      {
         return false;
      }
      m_lastTick     = t;
      m_lastTickTime = t.time;
      m_lastBid      = t.bid;
      m_lastAsk      = t.ask;
      return true;
   }

   // Spread in points. Uses cached tick; call Update() first.
   double SpreadPoints() const
   {
      if(m_point <= 0.0) return 0.0;
      return (m_lastAsk - m_lastBid) / m_point;
   }

   // Spread in price units.
   double SpreadPrice() const
   {
      return m_lastAsk - m_lastBid;
   }

   bool HasTick() const { return m_lastTickTime > 0; }
   datetime LastTickTime() const { return m_lastTickTime; }
   double Bid() const { return m_lastBid; }
   double Ask() const { return m_lastAsk; }
   double Mid() const { return (m_lastBid + m_lastAsk) * 0.5; }
   string Symbol() const { return m_symbol; }
   double Point() const { return m_point; }

   // Age of last tick in seconds.
   int TickAgeSeconds() const
   {
      if(m_lastTickTime <= 0) return 999999;
      return (int)(TimeCurrent() - m_lastTickTime);
   }
};

#endif // __MARKETDATA_MQH__