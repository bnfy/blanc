#include "../blanc_tab_name_rules.h"
using namespace blanc_prototype::tab_names;
static_assert(Normalize(u"  a\t b\u0085c\n ") == u"a b c");
static_assert(Normalize(u"a\u0001b\u007fc\u009fd") == u"abcd");
static_assert(!Normalize(u"\t\n\u0085\u0001"));
static_assert(Normalize(u"a\ufeffb\u2007c\u2028d") == u"a b c d");
static_assert([] { std::u16string s(99, u'a'); s += u"\U0001f600z"; auto n=Normalize(s); return n && n->size()==101 && n->back()==0xde00; }());
static_assert([] { std::u16string s(99, u'a'); s += u" z"; auto n=Normalize(s); return n && n->size()==99; }());
static_assert(!Resolve(u"Page title", u"", u" Page title "));
static_assert(!Resolve(u"Changed page", u"Mine", u"Mine"));
static_assert(Resolve(u"Page", u"Mine", u" ").has_value() && !*Resolve(u"Page", u"Mine", u" "));
static_assert(**Resolve(u"Page", u"", u"Mine") == u"Mine");
