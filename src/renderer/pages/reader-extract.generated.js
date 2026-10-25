(() => {
  const article = (() => { /*
 * Copyright (c) 2010 Arc90 Inc
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * This code is heavily based on Arc90's readability.js (1.7.1) script
 * available at: http://code.google.com/p/arc90labs-readability
 */

/**
 * Public constructor.
 * @param {HTMLDocument} doc     The document to parse.
 * @param {Object}       options The options object.
 */
function Readability(doc, options) {
  // In some older versions, people passed a URI as the first argument. Cope:
  if (options && options.documentElement) {
    doc = options;
    options = arguments[2];
  } else if (!doc || !doc.documentElement) {
    throw new Error(
      "First argument to Readability constructor should be a document object."
    );
  }
  options = options || {};

  this._doc = doc;
  this._docJSDOMParser = this._doc.firstChild.__JSDOMParser__;
  this._articleTitle = null;
  this._articleByline = null;
  this._articleDir = null;
  this._articleSiteName = null;
  this._attempts = [];
  this._metadata = {};

  // Configurable options
  this._debug = !!options.debug;
  this._maxElemsToParse =
    options.maxElemsToParse || this.DEFAULT_MAX_ELEMS_TO_PARSE;
  this._nbTopCandidates =
    options.nbTopCandidates || this.DEFAULT_N_TOP_CANDIDATES;
  this._charThreshold = options.charThreshold || this.DEFAULT_CHAR_THRESHOLD;
  this._classesToPreserve = this.CLASSES_TO_PRESERVE.concat(
    options.classesToPreserve || []
  );
  this._keepClasses = !!options.keepClasses;
  this._serializer =
    options.serializer ||
    function (el) {
      return el.innerHTML;
    };
  this._disableJSONLD = !!options.disableJSONLD;
  this._allowedVideoRegex = options.allowedVideoRegex || this.REGEXPS.videos;
  this._linkDensityModifier = options.linkDensityModifier || 0;

  // Start with all flags set
  this._flags =
    this.FLAG_STRIP_UNLIKELYS |
    this.FLAG_WEIGHT_CLASSES |
    this.FLAG_CLEAN_CONDITIONALLY;

  // Control whether log messages are sent to the console
  if (this._debug) {
    let logNode = function (node) {
      if (node.nodeType == node.TEXT_NODE) {
        return `${node.nodeName} ("${node.textContent}")`;
      }
      let attrPairs = Array.from(node.attributes || [], function (attr) {
        return `${attr.name}="${attr.value}"`;
      }).join(" ");
      return `<${node.localName} ${attrPairs}>`;
    };
    this.log = function () {
      if (typeof console !== "undefined") {
        let args = Array.from(arguments, arg => {
          if (arg && arg.nodeType == this.ELEMENT_NODE) {
            return logNode(arg);
          }
          return arg;
        });
        args.unshift("Reader: (Readability)");
        // eslint-disable-next-line no-console
        console.log(...args);
      } else if (typeof dump !== "undefined") {
        /* global dump */
        var msg = Array.prototype.map
          .call(arguments, function (x) {
            return x && x.nodeName ? logNode(x) : x;
          })
          .join(" ");
        dump("Reader: (Readability) " + msg + "\n");
      }
    };
  } else {
    this.log = function () {};
  }
}

Readability.prototype = {
  FLAG_STRIP_UNLIKELYS: 0x1,
  FLAG_WEIGHT_CLASSES: 0x2,
  FLAG_CLEAN_CONDITIONALLY: 0x4,

  // https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
  ELEMENT_NODE: 1,
  TEXT_NODE: 3,

  // Max number of nodes supported by this parser. Default: 0 (no limit)
  DEFAULT_MAX_ELEMS_TO_PARSE: 0,

  // The number of top candidates to consider when analysing how
  // tight the competition is among candidates.
  DEFAULT_N_TOP_CANDIDATES: 5,

  // Element tags to score by default.
  DEFAULT_TAGS_TO_SCORE: "section,h2,h3,h4,h5,h6,p,td,pre"
    .toUpperCase()
    .split(","),

  // The default number of chars an article must have in order to return a result
  DEFAULT_CHAR_THRESHOLD: 500,

  // All of the regular expressions in use within readability.
  // Defined up here so we don't instantiate them repeatedly in loops.
  REGEXPS: {
    // NOTE: These two regular expressions are duplicated in
    // Readability-readerable.js. Please keep both copies in sync.
    unlikelyCandidates:
      /-ad-|ai2html|banner|breadcrumbs|combx|comment|community|cover-wrap|disqus|extra|footer|gdpr|header|legends|menu|related|remark|replies|rss|shoutbox|sidebar|skyscraper|social|sponsor|supplemental|ad-break|agegate|pagination|pager|popup|yom-remote/i,
    okMaybeItsACandidate: /and|article|body|column|content|main|shadow/i,

    positive:
      /article|body|content|entry|hentry|h-entry|main|page|pagination|post|text|blog|story/i,
    negative:
      /-ad-|hidden|^hid$| hid$| hid |^hid |banner|combx|comment|com-|contact|footer|gdpr|masthead|media|meta|outbrain|promo|related|scroll|share|shoutbox|sidebar|skyscraper|sponsor|shopping|tags|widget/i,
    extraneous:
      /print|archive|comment|discuss|e[\-]?mail|share|reply|all|login|sign|single|utility/i,
    byline: /byline|author|dateline|writtenby|p-author/i,
    replaceFonts: /<(\/?)font[^>]*>/gi,
    normalize: /\s{2,}/g,
    videos:
      /\/\/(www\.)?((dailymotion|youtube|youtube-nocookie|player\.vimeo|v\.qq)\.com|(archive|upload\.wikimedia)\.org|player\.twitch\.tv)/i,
    shareElements: /(\b|_)(share|sharedaddy)(\b|_)/i,
    nextLink: /(next|weiter|continue|>([^\|]|$)|»([^\|]|$))/i,
    prevLink: /(prev|earl|old|new|<|«)/i,
    tokenize: /\W+/g,
    whitespace: /^\s*$/,
    hasContent: /\S$/,
    hashUrl: /^#.+/,
    srcsetUrl: /(\S+)(\s+[\d.]+[xw])?(\s*(?:,|$))/g,
    b64DataUrl: /^data:\s*([^\s;,]+)\s*;\s*base64\s*,/i,
    // Commas as used in Latin, Sindhi, Chinese and various other scripts.
    // see: https://en.wikipedia.org/wiki/Comma#Comma_variants
    commas: /\u002C|\u060C|\uFE50|\uFE10|\uFE11|\u2E41|\u2E34|\u2E32|\uFF0C/g,
    // See: https://schema.org/Article
    jsonLdArticleTypes:
      /^Article|AdvertiserContentArticle|NewsArticle|AnalysisNewsArticle|AskPublicNewsArticle|BackgroundNewsArticle|OpinionNewsArticle|ReportageNewsArticle|ReviewNewsArticle|Report|SatiricalArticle|ScholarlyArticle|MedicalScholarlyArticle|SocialMediaPosting|BlogPosting|LiveBlogPosting|DiscussionForumPosting|TechArticle|APIReference$/,
    // used to see if a node's content matches words commonly used for ad blocks or loading indicators
    adWords:
      /^(ad(vertising|vertisement)?|pub(licité)?|werb(ung)?|广告|Реклама|Anuncio)$/iu,
    loadingWords:
      /^((loading|正在加载|Загрузка|chargement|cargando)(…|\.\.\.)?)$/iu,
  },

  UNLIKELY_ROLES: [
    "menu",
    "menubar",
    "complementary",
    "navigation",
    "alert",
    "alertdialog",
    "dialog",
  ],

  DIV_TO_P_ELEMS: new Set([
    "BLOCKQUOTE",
    "DL",
    "DIV",
    "IMG",
    "OL",
    "P",
    "PRE",
    "TABLE",
    "UL",
  ]),

  ALTER_TO_DIV_EXCEPTIONS: ["DIV", "ARTICLE", "SECTION", "P", "OL", "UL"],

  PRESENTATIONAL_ATTRIBUTES: [
    "align",
    "background",
    "bgcolor",
    "border",
    "cellpadding",
    "cellspacing",
    "frame",
    "hspace",
    "rules",
    "style",
    "valign",
    "vspace",
  ],

  DEPRECATED_SIZE_ATTRIBUTE_ELEMS: ["TABLE", "TH", "TD", "HR", "PRE"],

  // The commented out elements qualify as phrasing content but tend to be
  // removed by readability when put into paragraphs, so we ignore them here.
  PHRASING_ELEMS: [
    // "CANVAS", "IFRAME", "SVG", "VIDEO",
    "ABBR",
    "AUDIO",
    "B",
    "BDO",
    "BR",
    "BUTTON",
    "CITE",
    "CODE",
    "DATA",
    "DATALIST",
    "DFN",
    "EM",
    "EMBED",
    "I",
    "IMG",
    "INPUT",
    "KBD",
    "LABEL",
    "MARK",
    "MATH",
    "METER",
    "NOSCRIPT",
    "OBJECT",
    "OUTPUT",
    "PROGRESS",
    "Q",
    "RUBY",
    "SAMP",
    "SCRIPT",
    "SELECT",
    "SMALL",
    "SPAN",
    "STRONG",
    "SUB",
    "SUP",
    "TEXTAREA",
    "TIME",
    "VAR",
    "WBR",
  ],

  // These are the classes that readability sets itself.
  CLASSES_TO_PRESERVE: ["page"],

  // These are the list of HTML entities that need to be escaped.
  HTML_ESCAPE_MAP: {
    lt: "<",
    gt: ">",
    amp: "&",
    quot: '"',
    apos: "'",
  },

  /**
   * Run any post-process modifications to article content as necessary.
   *
   * @param Element
   * @return void
   **/
  _postProcessContent(articleContent) {
    // Readability cannot open relative uris so we convert them to absolute uris.
    this._fixRelativeUris(articleContent);

    this._simplifyNestedElements(articleContent);

    if (!this._keepClasses) {
      // Remove classes.
      this._cleanClasses(articleContent);
    }
  },

  /**
   * Iterates over a NodeList, calls `filterFn` for each node and removes node
   * if function returned `true`.
   *
   * If function is not passed, removes all the nodes in node list.
   *
   * @param NodeList nodeList The nodes to operate on
   * @param Function filterFn the function to use as a filter
   * @return void
   */
  _removeNodes(nodeList, filterFn) {
    // Avoid ever operating on live node lists.
    if (this._docJSDOMParser && nodeList._isLiveNodeList) {
      throw new Error("Do not pass live node lists to _removeNodes");
    }
    for (var i = nodeList.length - 1; i >= 0; i--) {
      var node = nodeList[i];
      var parentNode = node.parentNode;
      if (parentNode) {
        if (!filterFn || filterFn.call(this, node, i, nodeList)) {
          parentNode.removeChild(node);
        }
      }
    }
  },

  /**
   * Iterates over a NodeList, and calls _setNodeTag for each node.
   *
   * @param NodeList nodeList The nodes to operate on
   * @param String newTagName the new tag name to use
   * @return void
   */
  _replaceNodeTags(nodeList, newTagName) {
    // Avoid ever operating on live node lists.
    if (this._docJSDOMParser && nodeList._isLiveNodeList) {
      throw new Error("Do not pass live node lists to _replaceNodeTags");
    }
    for (const node of nodeList) {
      this._setNodeTag(node, newTagName);
    }
  },

  /**
   * Iterate over a NodeList, which doesn't natively fully implement the Array
   * interface.
   *
   * For convenience, the current object context is applied to the provided
   * iterate function.
   *
   * @param  NodeList nodeList The NodeList.
   * @param  Function fn       The iterate function.
   * @return void
   */
  _forEachNode(nodeList, fn) {
    Array.prototype.forEach.call(nodeList, fn, this);
  },

  /**
   * Iterate over a NodeList, and return the first node that passes
   * the supplied test function
   *
   * For convenience, the current object context is applied to the provided
   * test function.
   *
   * @param  NodeList nodeList The NodeList.
   * @param  Function fn       The test function.
   * @return void
   */
  _findNode(nodeList, fn) {
    return Array.prototype.find.call(nodeList, fn, this);
  },

  /**
   * Iterate over a NodeList, return true if any of the provided iterate
   * function calls returns true, false otherwise.
   *
   * For convenience, the current object context is applied to the
   * provided iterate function.
   *
   * @param  NodeList nodeList The NodeList.
   * @param  Function fn       The iterate function.
   * @return Boolean
   */
  _someNode(nodeList, fn) {
    return Array.prototype.some.call(nodeList, fn, this);
  },

  /**
   * Iterate over a NodeList, return true if all of the provided iterate
   * function calls return true, false otherwise.
   *
   * For convenience, the current object context is applied to the
   * provided iterate function.
   *
   * @param  NodeList nodeList The NodeList.
   * @param  Function fn       The iterate function.
   * @return Boolean
   */
  _everyNode(nodeList, fn) {
    return Array.prototype.every.call(nodeList, fn, this);
  },

  _getAllNodesWithTag(node, tagNames) {
    if (node.querySelectorAll) {
      return node.querySelectorAll(tagNames.join(","));
    }
    return [].concat.apply(
      [],
      tagNames.map(function (tag) {
        var collection = node.getElementsByTagName(tag);
        return Array.isArray(collection) ? collection : Array.from(collection);
      })
    );
  },

  /**
   * Removes the class="" attribute from every element in the given
   * subtree, except those that match CLASSES_TO_PRESERVE and
   * the classesToPreserve array from the options object.
   *
   * @param Element
   * @return void
   */
  _cleanClasses(node) {
    var classesToPreserve = this._classesToPreserve;
    var className = (node.getAttribute("class") || "")
      .split(/\s+/)
      .filter(cls => classesToPreserve.includes(cls))
      .join(" ");

    if (className) {
      node.setAttribute("class", className);
    } else {
      node.removeAttribute("class");
    }

    for (node = node.firstElementChild; node; node = node.nextElementSibling) {
      this._cleanClasses(node);
    }
  },

  /**
   * Tests whether a string is a URL or not.
   *
   * @param {string} str The string to test
   * @return {boolean} true if str is a URL, false if not
   */
  _isUrl(str) {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  },
  /**
   * Converts each <a> and <img> uri in the given element to an absolute URI,
   * ignoring #ref URIs.
   *
   * @param Element
   * @return void
   */
  _fixRelativeUris(articleContent) {
    var baseURI = this._doc.baseURI;
    var documentURI = this._doc.documentURI;
    function toAbsoluteURI(uri) {
      // Leave hash links alone if the base URI matches the document URI:
      if (baseURI == documentURI && uri.charAt(0) == "#") {
        return uri;
      }

      // Otherwise, resolve against base URI:
      try {
        return new URL(uri, baseURI).href;
      } catch (ex) {
        // Something went wrong, just return the original:
      }
      return uri;
    }

    var links = this._getAllNodesWithTag(articleContent, ["a"]);
    this._forEachNode(links, function (link) {
      var href = link.getAttribute("href");
      if (href) {
        // Remove links with javascript: URIs, since
        // they won't work after scripts have been removed from the page.
        if (href.indexOf("javascript:") === 0) {
          // if the link only contains simple text content, it can be converted to a text node
          if (
            link.childNodes.length === 1 &&
            link.childNodes[0].nodeType === this.TEXT_NODE
          ) {
            var text = this._doc.createTextNode(link.textContent);
            link.parentNode.replaceChild(text, link);
          } else {
            // if the link has multiple children, they should all be preserved
            var container = this._doc.createElement("span");
            while (link.firstChild) {
              container.appendChild(link.firstChild);
            }
            link.parentNode.replaceChild(container, link);
          }
        } else {
          link.setAttribute("href", toAbsoluteURI(href));
        }
      }
    });

    var medias = this._getAllNodesWithTag(articleContent, [
      "img",
      "picture",
      "figure",
      "video",
      "audio",
      "source",
    ]);

    this._forEachNode(medias, function (media) {
      var src = media.getAttribute("src");
      var poster = media.getAttribute("poster");
      var srcset = media.getAttribute("srcset");

      if (src) {
        media.setAttribute("src", toAbsoluteURI(src));
      }

      if (poster) {
        media.setAttribute("poster", toAbsoluteURI(poster));
      }

      if (srcset) {
        var newSrcset = srcset.replace(
          this.REGEXPS.srcsetUrl,
          function (_, p1, p2, p3) {
            return toAbsoluteURI(p1) + (p2 || "") + p3;
          }
        );

        media.setAttribute("srcset", newSrcset);
      }
    });
  },

  _simplifyNestedElements(articleContent) {
    var node = articleContent;

    while (node) {
      if (
        node.parentNode &&
        ["DIV", "SECTION"].includes(node.tagName) &&
        !(node.id && node.id.startsWith("readability"))
      ) {
        if (this._isElementWithoutContent(node)) {
          node = this._removeAndGetNext(node);
          continue;
        } else if (
          this._hasSingleTagInsideElement(node, "DIV") ||
          this._hasSingleTagInsideElement(node, "SECTION")
        ) {
          var child = node.children[0];
          for (var i = 0; i < node.attributes.length; i++) {
            child.setAttributeNode(node.attributes[i].cloneNode());
          }
          node.parentNode.replaceChild(child, node);
          node = child;
          continue;
        }
      }

      node = this._getNextNode(node);
    }
  },

  /**
   * Get the article title as an H1.
   *
   * @return string
   **/
  _getArticleTitle() {
    var doc = this._doc;
    var curTitle = "";
    var origTitle = "";

    try {
      curTitle = origTitle = doc.title.trim();

      // If they had an element with id "title" in their HTML
      if (typeof curTitle !== "string") {
        curTitle = origTitle = this._getInnerText(
          doc.getElementsByTagName("title")[0]
        );
      }
    } catch (e) {
      /* ignore exceptions setting the title. */
    }

    var titleHadHierarchicalSeparators = false;
    function wordCount(str) {
      return str.split(/\s+/).length;
    }

    // If there's a separator in the title, first remove the final part
    if (/ [\|\-\\\/>»] /.test(curTitle)) {
      titleHadHierarchicalSeparators = / [\\\/>»] /.test(curTitle);
      let allSeparators = Array.from(origTitle.matchAll(/ [\|\-\\\/>»] /gi));
      curTitle = origTitle.substring(0, allSeparators.pop().index);

      // If the resulting title is too short, remove the first part instead:
      if (wordCount(curTitle) < 3) {
        curTitle = origTitle.replace(/^[^\|\-\\\/>»]*[\|\-\\\/>»]/gi, "");
      }
    } else if (curTitle.includes(": ")) {
      // Check if we have an heading containing this exact string, so we
      // could assume it's the full title.
      var headings = this._getAllNodesWithTag(doc, ["h1", "h2"]);
      var trimmedTitle = curTitle.trim();
      var match = this._someNode(headings, function (heading) {
        return heading.textContent.trim() === trimmedTitle;
      });

      // If we don't, let's extract the title out of the original title string.
      if (!match) {
        curTitle = origTitle.substring(origTitle.lastIndexOf(":") + 1);

        // If the title is now too short, try the first colon instead:
        if (wordCount(curTitle) < 3) {
          curTitle = origTitle.substring(origTitle.indexOf(":") + 1);
          // But if we have too many words before the colon there's something weird
          // with the titles and the H tags so let's just use the original title instead
        } else if (wordCount(origTitle.substr(0, origTitle.indexOf(":"))) > 5) {
          curTitle = origTitle;
        }
      }
    } else if (curTitle.length > 150 || curTitle.length < 15) {
      var hOnes = doc.getElementsByTagName("h1");

      if (hOnes.length === 1) {
        curTitle = this._getInnerText(hOnes[0]);
      }
    }

    curTitle = curTitle.trim().replace(this.REGEXPS.normalize, " ");
    // If we now have 4 words or fewer as our title, and either no
    // 'hierarchical' separators (\, /, > or ») were found in the original
    // title or we decreased the number of words by more than 1 word, use
    // the original title.
    var curTitleWordCount = wordCount(curTitle);
    if (
      curTitleWordCount <= 4 &&
      (!titleHadHierarchicalSeparators ||
        curTitleWordCount !=
          wordCount(origTitle.replace(/[\|\-\\\/>»]+/g, "")) - 1)
    ) {
      curTitle = origTitle;
    }

    return curTitle;
  },

  /**
   * Prepare the HTML document for readability to scrape it.
   * This includes things like stripping javascript, CSS, and handling terrible markup.
   *
   * @return void
   **/
  _prepDocument() {
    var doc = this._doc;

    // Remove all style tags in head
    this._removeNodes(this._getAllNodesWithTag(doc, ["style"]));

    if (doc.body) {
      this._replaceBrs(doc.body);
    }

    this._replaceNodeTags(this._getAllNodesWithTag(doc, ["font"]), "SPAN");
  },

  /**
   * Finds the next node, starting from the given node, and ignoring
   * whitespace in between. If the given node is an element, the same node is
   * returned.
   */
  _nextNode(node) {
    var next = node;
    while (
      next &&
      next.nodeType != this.ELEMENT_NODE &&
      this.REGEXPS.whitespace.test(next.textContent)
    ) {
      next = next.nextSibling;
    }
    return next;
  },

  /**
   * Replaces 2 or more successive <br> elements with a single <p>.
   * Whitespace between <br> elements are ignored. For example:
   *   <div>foo<br>bar<br> <br><br>abc</div>
   * will become:
   *   <div>foo<br>bar<p>abc</p></div>
   */
  _replaceBrs(elem) {
    this._forEachNode(this._getAllNodesWithTag(elem, ["br"]), function (br) {
      var next = br.nextSibling;

      // Whether 2 or more <br> elements have been found and replaced with a
      // <p> block.
      var replaced = false;

      // If we find a <br> chain, remove the <br>s until we hit another node
      // or non-whitespace. This leaves behind the first <br> in the chain
      // (which will be replaced with a <p> later).
      while ((next = this._nextNode(next)) && next.tagName == "BR") {
        replaced = true;
        var brSibling = next.nextSibling;
        next.remove();
        next = brSibling;
      }

      // If we removed a <br> chain, replace the remaining <br> with a <p>. Add
      // all sibling nodes as children of the <p> until we hit another <br>
      // chain.
      if (replaced) {
        var p = this._doc.createElement("p");
        br.parentNode.replaceChild(p, br);

        next = p.nextSibling;
        while (next) {
          // If we've hit another <br><br>, we're done adding children to this <p>.
          if (next.tagName == "BR") {
            var nextElem = this._nextNode(next.nextSibling);
            if (nextElem && nextElem.tagName == "BR") {
              break;
            }
          }

          if (!this._isPhrasingContent(next)) {
            break;
          }

          // Otherwise, make this node a child of the new <p>.
          var sibling = next.nextSibling;
          p.appendChild(next);
          next = sibling;
        }

        while (p.lastChild && this._isWhitespace(p.lastChild)) {
          p.lastChild.remove();
        }

        if (p.parentNode.tagName === "P") {
          this._setNodeTag(p.parentNode, "DIV");
        }
      }
    });
  },

  _setNodeTag(node, tag) {
    this.log("_setNodeTag", node, tag);
    if (this._docJSDOMParser) {
      node.localName = tag.toLowerCase();
      node.tagName = tag.toUpperCase();
      return node;
    }

    var replacement = node.ownerDocument.createElement(tag);
    while (node.firstChild) {
      replacement.appendChild(node.firstChild);
    }
    node.parentNode.replaceChild(replacement, node);
    if (node.readability) {
      replacement.readability = node.readability;
    }

    for (var i = 0; i < node.attributes.length; i++) {
      replacement.setAttributeNode(node.attributes[i].cloneNode());
    }
    return replacement;
  },

  /**
   * Prepare the article node for display. Clean out any inline styles,
   * iframes, forms, strip extraneous <p> tags, etc.
   *
   * @param Element
   * @return void
   **/
  _prepArticle(articleContent) {
    this._cleanStyles(articleContent);

    // Check for data tables before we continue, to avoid removing items in
    // those tables, which will often be isolated even though they're
    // visually linked to other content-ful elements (text, images, etc.).
    this._markDataTables(articleContent);

    this._fixLazyImages(articleContent);

    // Clean out junk from the article content
    this._cleanConditionally(articleContent, "form");
    this._cleanConditionally(articleContent, "fieldset");
    this._clean(articleContent, "object");
    this._clean(articleContent, "embed");
    this._clean(articleContent, "footer");
    this._clean(articleContent, "link");
    this._clean(articleContent, "aside");

    // Clean out elements with little content that have "share" in their id/class combinations from final top candidates,
    // which means we don't remove the top candidates even they have "share".

    var shareElementThreshold = this.DEFAULT_CHAR_THRESHOLD;

    this._forEachNode(articleContent.children, function (topCandidate) {
      this._cleanMatchedNodes(topCandidate, function (node, matchString) {
        return (
          this.REGEXPS.shareElements.test(matchString) &&
          node.textContent.length < shareElementThreshold
        );
      });
    });

    this._clean(articleContent, "iframe");
    this._clean(articleContent, "input");
    this._clean(articleContent, "textarea");
    this._clean(articleContent, "select");
    this._clean(articleContent, "button");
    this._cleanHeaders(articleContent);

    // Do these last as the previous stuff may have removed junk
    // that will affect these
    this._cleanConditionally(articleContent, "table");
    this._cleanConditionally(articleContent, "ul");
    this._cleanConditionally(articleContent, "div");

    // replace H1 with H2 as H1 should be only title that is displayed separately
    this._replaceNodeTags(
      this._getAllNodesWithTag(articleContent, ["h1"]),
      "h2"
    );

    // Remove extra paragraphs
    this._removeNodes(
      this._getAllNodesWithTag(articleContent, ["p"]),
      function (paragraph) {
        // At this point, nasty iframes have been removed; only embedded video
        // ones remain.
        var contentElementCount = this._getAllNodesWithTag(paragraph, [
          "img",
          "embed",
          "object",
          "iframe",
        ]).length;
        return (
          contentElementCount === 0 && !this._getInnerText(paragraph, false)
        );
      }
    );

    this._forEachNode(
      this._getAllNodesWithTag(articleContent, ["br"]),
      function (br) {
        var next = this._nextNode(br.nextSibling);
        if (next && next.tagName == "P") {
          br.remove();
        }
      }
    );

    // Remove single-cell tables
    this._forEachNode(
      this._getAllNodesWithTag(articleContent, ["table"]),
      function (table) {
        var tbody = this._hasSingleTagInsideElement(table, "TBODY")
          ? table.firstElementChild
          : table;
        if (this._hasSingleTagInsideElement(tbody, "TR")) {
          var row = tbody.firstElementChild;
          if (this._hasSingleTagInsideElement(row, "TD")) {
            var cell = row.firstElementChild;
            cell = this._setNodeTag(
              cell,
              this._everyNode(cell.childNodes, this._isPhrasingContent)
                ? "P"
                : "DIV"
            );
            table.parentNode.replaceChild(cell, table);
          }
        }
      }
    );
  },

  /**
   * Initialize a node with the readability object. Also checks the
   * className/id for special names to add to its score.
   *
   * @param Element
   * @return void
   **/
  _initializeNode(node) {
    node.readability = { contentScore: 0 };

    switch (node.tagName) {
      case "DIV":
        node.readability.contentScore += 5;
        break;

      case "PRE":
      case "TD":
      case "BLOCKQUOTE":
        node.readability.contentScore += 3;
        break;

      case "ADDRESS":
      case "OL":
      case "UL":
      case "DL":
      case "DD":
      case "DT":
      case "LI":
      case "FORM":
        node.readability.contentScore -= 3;
        break;

      case "H1":
      case "H2":
      case "H3":
      case "H4":
      case "H5":
      case "H6":
      case "TH":
        node.readability.contentScore -= 5;
        break;
    }

    node.readability.contentScore += this._getClassWeight(node);
  },

  _removeAndGetNext(node) {
    var nextNode = this._getNextNode(node, true);
    node.remove();
    return nextNode;
  },

  /**
   * Traverse the DOM from node to node, starting at the node passed in.
   * Pass true for the second parameter to indicate this node itself
   * (and its kids) are going away, and we want the next node over.
   *
   * Calling this in a loop will traverse the DOM depth-first.
   *
   * @param {Element} node
   * @param {boolean} ignoreSelfAndKids
   * @return {Element}
   */
  _getNextNode(node, ignoreSelfAndKids) {
    // First check for kids if those aren't being ignored
    if (!ignoreSelfAndKids && node.firstElementChild) {
      return node.firstElementChild;
    }
    // Then for siblings...
    if (node.nextElementSibling) {
      return node.nextElementSibling;
    }
    // And finally, move up the parent chain *and* find a sibling
    // (because this is depth-first traversal, we will have already
    // seen the parent nodes themselves).
    do {
      node = node.parentNode;
    } while (node && !node.nextElementSibling);
    return node && node.nextElementSibling;
  },

  // compares second text to first one
  // 1 = same text, 0 = completely different text
  // works the way that it splits both texts into words and then finds words that are unique in second text
  // the result is given by the lower length of unique parts
  _textSimilarity(textA, textB) {
    var tokensA = textA
      .toLowerCase()
      .split(this.REGEXPS.tokenize)
      .filter(Boolean);
    var tokensB = textB
      .toLowerCase()
      .split(this.REGEXPS.tokenize)
      .filter(Boolean);
    if (!tokensA.length || !tokensB.length) {
      return 0;
    }
    var uniqTokensB = tokensB.filter(token => !tokensA.includes(token));
    var distanceB = uniqTokensB.join(" ").length / tokensB.join(" ").length;
    return 1 - distanceB;
  },

  /**
   * Checks whether an element node contains a valid byline
   *
   * @param node {Element}
   * @param matchString {string}
   * @return boolean
   */
  _isValidByline(node, matchString) {
    var rel = node.getAttribute("rel");
    var itemprop = node.getAttribute("itemprop");
    var bylineLength = node.textContent.trim().length;

    return (
      (rel === "author" ||
        (itemprop && itemprop.includes("author")) ||
        this.REGEXPS.byline.test(matchString)) &&
      !!bylineLength &&
      bylineLength < 100
    );
  },

  _getNodeAncestors(node, maxDepth) {
    maxDepth = maxDepth || 0;
    var i = 0,
      ancestors = [];
    while (node.parentNode) {
      ancestors.push(node.parentNode);
      if (maxDepth && ++i === maxDepth) {
        break;
      }
      node = node.parentNode;
    }
    return ancestors;
  },

  /***
   * grabArticle - Using a variety of metrics (content score, classname, element types), find the content that is
   *         most likely to be the stuff a user wants to read. Then return it wrapped up in a div.
   *
   * @param page a document to run upon. Needs to be a full document, complete with body.
   * @return Element
   **/
  /* eslint-disable-next-line complexity */
  _grabArticle(page) {
    this.log("**** grabArticle ****");
    var doc = this._doc;
    var isPaging = page !== null;
    page = page ? page : this._doc.body;

    // We can't grab an article if we don't have a page!
    if (!page) {
      this.log("No body found in document. Abort.");
      return null;
    }

    var pageCacheHtml = page.innerHTML;

    while (true) {
      this.log("Starting grabArticle loop");
      var stripUnlikelyCandidates = this._flagIsActive(
        this.FLAG_STRIP_UNLIKELYS
      );

      // First, node prepping. Trash nodes that look cruddy (like ones with the
      // class name "comment", etc), and turn divs into P tags where they have been
      // used inappropriately (as in, where they contain no other block level elements.)
      var elementsToScore = [];
      var node = this._doc.documentElement;

      let shouldRemoveTitleHeader = true;

      while (node) {
        if (node.tagName === "HTML") {
          this._articleLang = node.getAttribute("lang");
        }

        var matchString = node.className + " " + node.id;

        if (!this._isProbablyVisible(node)) {
          this.log("Removing hidden node - " + matchString);
          node = this._removeAndGetNext(node);
          continue;
        }

        // User is not able to see elements applied with both "aria-modal = true" and "role = dialog"
        if (
          node.getAttribute("aria-modal") == "true" &&
          node.getAttribute("role") == "dialog"
        ) {
          node = this._removeAndGetNext(node);
          continue;
        }

        // If we don't have a byline yet check to see if this node is a byline; if it is store the byline and remove the node.
        if (
          !this._articleByline &&
          !this._metadata.byline &&
          this._isValidByline(node, matchString)
        ) {
          // Find child node matching [itemprop="name"] and use that if it exists for a more accurate author name byline
          var endOfSearchMarkerNode = this._getNextNode(node, true);
          var next = this._getNextNode(node);
          var itemPropNameNode = null;
          while (next && next != endOfSearchMarkerNode) {
            var itemprop = next.getAttribute("itemprop");
            if (itemprop && itemprop.includes("name")) {
              itemPropNameNode = next;
              break;
            } else {
              next = this._getNextNode(next);
            }
          }
          this._articleByline = (itemPropNameNode ?? node).textContent.trim();
          node = this._removeAndGetNext(node);
          continue;
        }

        if (shouldRemoveTitleHeader && this._headerDuplicatesTitle(node)) {
          this.log(
            "Removing header: ",
            node.textContent.trim(),
            this._articleTitle.trim()
          );
          shouldRemoveTitleHeader = false;
          node = this._removeAndGetNext(node);
          continue;
        }

        // Remove unlikely candidates
        if (stripUnlikelyCandidates) {
          if (
            this.REGEXPS.unlikelyCandidates.test(matchString) &&
            !this.REGEXPS.okMaybeItsACandidate.test(matchString) &&
            !this._hasAncestorTag(node, "table") &&
            !this._hasAncestorTag(node, "code") &&
            node.tagName !== "BODY" &&
            node.tagName !== "A"
          ) {
            this.log("Removing unlikely candidate - " + matchString);
            node = this._removeAndGetNext(node);
            continue;
          }

          if (this.UNLIKELY_ROLES.includes(node.getAttribute("role"))) {
            this.log(
              "Removing content with role " +
                node.getAttribute("role") +
                " - " +
                matchString
            );
            node = this._removeAndGetNext(node);
            continue;
          }
        }

        // Remove DIV, SECTION, and HEADER nodes without any content(e.g. text, image, video, or iframe).
        if (
          (node.tagName === "DIV" ||
            node.tagName === "SECTION" ||
            node.tagName === "HEADER" ||
            node.tagName === "H1" ||
            node.tagName === "H2" ||
            node.tagName === "H3" ||
            node.tagName === "H4" ||
            node.tagName === "H5" ||
            node.tagName === "H6") &&
          this._isElementWithoutContent(node)
        ) {
          node = this._removeAndGetNext(node);
          continue;
        }

        if (this.DEFAULT_TAGS_TO_SCORE.includes(node.tagName)) {
          elementsToScore.push(node);
        }

        // Turn all divs that don't have children block level elements into p's
        if (node.tagName === "DIV") {
          // Put phrasing content into paragraphs.
          var p = null;
          var childNode = node.firstChild;
          while (childNode) {
            var nextSibling = childNode.nextSibling;
            if (this._isPhrasingContent(childNode)) {
              if (p !== null) {
                p.appendChild(childNode);
              } else if (!this._isWhitespace(childNode)) {
                p = doc.createElement("p");
                node.replaceChild(p, childNode);
                p.appendChild(childNode);
              }
            } else if (p !== null) {
              while (p.lastChild && this._isWhitespace(p.lastChild)) {
                p.lastChild.remove();
              }
              p = null;
            }
            childNode = nextSibling;
          }

          // Sites like http://mobile.slate.com encloses each paragraph with a DIV
          // element. DIVs with only a P element inside and no text content can be
          // safely converted into plain P elements to avoid confusing the scoring
          // algorithm with DIVs with are, in practice, paragraphs.
          if (
            this._hasSingleTagInsideElement(node, "P") &&
            this._getLinkDensity(node) < 0.25
          ) {
            var newNode = node.children[0];
            node.parentNode.replaceChild(newNode, node);
            node = newNode;
            elementsToScore.push(node);
          } else if (!this._hasChildBlockElement(node)) {
            node = this._setNodeTag(node, "P");
            elementsToScore.push(node);
          }
        }
        node = this._getNextNode(node);
      }

      /**
       * Loop through all paragraphs, and assign a score to them based on how content-y they look.
       * Then add their score to their parent node.
       *
       * A score is determined by things like number of commas, class names, etc. Maybe eventually link density.
       **/
      var candidates = [];
      this._forEachNode(elementsToScore, function (elementToScore) {
        if (
          !elementToScore.parentNode ||
          typeof elementToScore.parentNode.tagName === "undefined"
        ) {
          return;
        }

        // If this paragraph is less than 25 characters, don't even count it.
        var innerText = this._getInnerText(elementToScore);
        if (innerText.length < 25) {
          return;
        }

        // Exclude nodes with no ancestor.
        var ancestors = this._getNodeAncestors(elementToScore, 5);
        if (ancestors.length === 0) {
          return;
        }

        var contentScore = 0;

        // Add a point for the paragraph itself as a base.
        contentScore += 1;

        // Add points for any commas within this paragraph.
        contentScore += innerText.split(this.REGEXPS.commas).length;

        // For every 100 characters in this paragraph, add another point. Up to 3 points.
        contentScore += Math.min(Math.floor(innerText.length / 100), 3);

        // Initialize and score ancestors.
        this._forEachNode(ancestors, function (ancestor, level) {
          if (
            !ancestor.tagName ||
            !ancestor.parentNode ||
            typeof ancestor.parentNode.tagName === "undefined"
          ) {
            return;
          }

          if (typeof ancestor.readability === "undefined") {
            this._initializeNode(ancestor);
            candidates.push(ancestor);
          }

          // Node score divider:
          // - parent:             1 (no division)
          // - grandparent:        2
          // - great grandparent+: ancestor level * 3
          if (level === 0) {
            var scoreDivider = 1;
          } else if (level === 1) {
            scoreDivider = 2;
          } else {
            scoreDivider = level * 3;
          }
          ancestor.readability.contentScore += contentScore / scoreDivider;
        });
      });

      // After we've calculated scores, loop through all of the possible
      // candidate nodes we found and find the one with the highest score.
      var topCandidates = [];
      for (var c = 0, cl = candidates.length; c < cl; c += 1) {
        var candidate = candidates[c];

        // Scale the final candidates score based on link density. Good content
        // should have a relatively small link density (5% or less) and be mostly
        // unaffected by this operation.
        var candidateScore =
          candidate.readability.contentScore *
          (1 - this._getLinkDensity(candidate));
        candidate.readability.contentScore = candidateScore;

        this.log("Candidate:", candidate, "with score " + candidateScore);

        for (var t = 0; t < this._nbTopCandidates; t++) {
          var aTopCandidate = topCandidates[t];

          if (
            !aTopCandidate ||
            candidateScore > aTopCandidate.readability.contentScore
          ) {
            topCandidates.splice(t, 0, candidate);
            if (topCandidates.length > this._nbTopCandidates) {
              topCandidates.pop();
            }
            break;
          }
        }
      }

      var topCandidate = topCandidates[0] || null;
      var neededToCreateTopCandidate = false;
      var parentOfTopCandidate;

      // If we still have no top candidate, just use the body as a last resort.
      // We also have to copy the body node so it is something we can modify.
      if (topCandidate === null || topCandidate.tagName === "BODY") {
        // Move all of the page's children into topCandidate
        topCandidate = doc.createElement("DIV");
        neededToCreateTopCandidate = true;
        // Move everything (not just elements, also text nodes etc.) into the container
        // so we even include text directly in the body:
        while (page.firstChild) {
          this.log("Moving child out:", page.firstChild);
          topCandidate.appendChild(page.firstChild);
        }

        page.appendChild(topCandidate);

        this._initializeNode(topCandidate);
      } else if (topCandidate) {
        // Find a better top candidate node if it contains (at least three) nodes which belong to `topCandidates` array
        // and whose scores are quite closed with current `topCandidate` node.
        var alternativeCandidateAncestors = [];
        for (var i = 1; i < topCandidates.length; i++) {
          if (
            topCandidates[i].readability.contentScore /
              topCandidate.readability.contentScore >=
            0.75
          ) {
            alternativeCandidateAncestors.push(
              this._getNodeAncestors(topCandidates[i])
            );
          }
        }
        var MINIMUM_TOPCANDIDATES = 3;
        if (alternativeCandidateAncestors.length >= MINIMUM_TOPCANDIDATES) {
          parentOfTopCandidate = topCandidate.parentNode;
          while (parentOfTopCandidate.tagName !== "BODY") {
            var listsContainingThisAncestor = 0;
            for (
              var ancestorIndex = 0;
              ancestorIndex < alternativeCandidateAncestors.length &&
              listsContainingThisAncestor < MINIMUM_TOPCANDIDATES;
              ancestorIndex++
            ) {
              listsContainingThisAncestor += Number(
                alternativeCandidateAncestors[ancestorIndex].includes(
                  parentOfTopCandidate
                )
              );
            }
            if (listsContainingThisAncestor >= MINIMUM_TOPCANDIDATES) {
              topCandidate = parentOfTopCandidate;
              break;
            }
            parentOfTopCandidate = parentOfTopCandidate.parentNode;
          }
        }
        if (!topCandidate.readability) {
          this._initializeNode(topCandidate);
        }

        // Because of our bonus system, parents of candidates might have scores
        // themselves. They get half of the node. There won't be nodes with higher
        // scores than our topCandidate, but if we see the score going *up* in the first
        // few steps up the tree, that's a decent sign that there might be more content
        // lurking in other places that we want to unify in. The sibling stuff
        // below does some of that - but only if we've looked high enough up the DOM
        // tree.
        parentOfTopCandidate = topCandidate.parentNode;
        var lastScore = topCandidate.readability.contentScore;
        // The scores shouldn't get too low.
        var scoreThreshold = lastScore / 3;
        while (parentOfTopCandidate.tagName !== "BODY") {
          if (!parentOfTopCandidate.readability) {
            parentOfTopCandidate = parentOfTopCandidate.parentNode;
            continue;
          }
          var parentScore = parentOfTopCandidate.readability.contentScore;
          if (parentScore < scoreThreshold) {
            break;
          }
          if (parentScore > lastScore) {
            // Alright! We found a better parent to use.
            topCandidate = parentOfTopCandidate;
            break;
          }
          lastScore = parentOfTopCandidate.readability.contentScore;
          parentOfTopCandidate = parentOfTopCandidate.parentNode;
        }

        // If the top candidate is the only child, use parent instead. This will help sibling
        // joining logic when adjacent content is actually located in parent's sibling node.
        parentOfTopCandidate = topCandidate.parentNode;
        while (
          parentOfTopCandidate.tagName != "BODY" &&
          parentOfTopCandidate.children.length == 1
        ) {
          topCandidate = parentOfTopCandidate;
          parentOfTopCandidate = topCandidate.parentNode;
        }
        if (!topCandidate.readability) {
          this._initializeNode(topCandidate);
        }
      }

      // Now that we have the top candidate, look through its siblings for content
      // that might also be related. Things like preambles, content split by ads
      // that we removed, etc.
      var articleContent = doc.createElement("DIV");
      if (isPaging) {
        articleContent.id = "readability-content";
      }

      var siblingScoreThreshold = Math.max(
        10,
        topCandidate.readability.contentScore * 0.2
      );
      // Keep potential top candidate's parent node to try to get text direction of it later.
      parentOfTopCandidate = topCandidate.parentNode;
      var siblings = parentOfTopCandidate.children;

      for (var s = 0, sl = siblings.length; s < sl; s++) {
        var sibling = siblings[s];
        var append = false;

        this.log(
          "Looking at sibling node:",
          sibling,
          sibling.readability
            ? "with score " + sibling.readability.contentScore
            : ""
        );
        this.log(
          "Sibling has score",
          sibling.readability ? sibling.readability.contentScore : "Unknown"
        );

        if (sibling === topCandidate) {
          append = true;
        } else {
          var contentBonus = 0;

          // Give a bonus if sibling nodes and top candidates have the example same classname
          if (
            sibling.className === topCandidate.className &&
            topCandidate.className !== ""
          ) {
            contentBonus += topCandidate.readability.contentScore * 0.2;
          }

          if (
            sibling.readability &&
            sibling.readability.contentScore + contentBonus >=
              siblingScoreThreshold
          ) {
            append = true;
          } else if (sibling.nodeName === "P") {
            var linkDensity = this._getLinkDensity(sibling);
            var nodeContent = this._getInnerText(sibling);
            var nodeLength = nodeContent.length;

            if (nodeLength > 80 && linkDensity < 0.25) {
              append = true;
            } else if (
              nodeLength < 80 &&
              nodeLength > 0 &&
              linkDensity === 0 &&
              nodeContent.search(/\.( |$)/) !== -1
            ) {
              append = true;
            }
          }
        }

        if (append) {
          this.log("Appending node:", sibling);

          if (!this.ALTER_TO_DIV_EXCEPTIONS.includes(sibling.nodeName)) {
            // We have a node that isn't a common block level element, like a form or td tag.
            // Turn it into a div so it doesn't get filtered out later by accident.
            this.log("Altering sibling:", sibling, "to div.");

            sibling = this._setNodeTag(sibling, "DIV");
          }

          articleContent.appendChild(sibling);
          // Fetch children again to make it compatible
          // with DOM parsers without live collection support.
          siblings = parentOfTopCandidate.children;
          // siblings is a reference to the children array, and
          // sibling is removed from the array when we call appendChild().
          // As a result, we must revisit this index since the nodes
          // have been shifted.
          s -= 1;
          sl -= 1;
        }
      }

      if (this._debug) {
        this.log("Article content pre-prep: " + articleContent.innerHTML);
      }
      // So we have all of the content that we need. Now we clean it up for presentation.
      this._prepArticle(articleContent);
      if (this._debug) {
        this.log("Article content post-prep: " + articleContent.innerHTML);
      }

      if (neededToCreateTopCandidate) {
        // We already created a fake div thing, and there wouldn't have been any siblings left
        // for the previous loop, so there's no point trying to create a new div, and then
        // move all the children over. Just assign IDs and class names here. No need to append
        // because that already happened anyway.
        topCandidate.id = "readability-page-1";
        topCandidate.className = "page";
      } else {
        var div = doc.createElement("DIV");
        div.id = "readability-page-1";
        div.className = "page";
        while (articleContent.firstChild) {
          div.appendChild(articleContent.firstChild);
        }
        articleContent.appendChild(div);
      }

      if (this._debug) {
        this.log("Article content after paging: " + articleContent.innerHTML);
      }

      var parseSuccessful = true;

      // Now that we've gone through the full algorithm, check to see if
      // we got any meaningful content. If we didn't, we may need to re-run
      // grabArticle with different flags set. This gives us a higher likelihood of
      // finding the content, and the sieve approach gives us a higher likelihood of
      // finding the -right- content.
      var textLength = this._getInnerText(articleContent, true).length;
      if (textLength < this._charThreshold) {
        parseSuccessful = false;
        // eslint-disable-next-line no-unsanitized/property
        page.innerHTML = pageCacheHtml;

        this._attempts.push({
          articleContent,
          textLength,
        });

        if (this._flagIsActive(this.FLAG_STRIP_UNLIKELYS)) {
          this._removeFlag(this.FLAG_STRIP_UNLIKELYS);
        } else if (this._flagIsActive(this.FLAG_WEIGHT_CLASSES)) {
          this._removeFlag(this.FLAG_WEIGHT_CLASSES);
        } else if (this._flagIsActive(this.FLAG_CLEAN_CONDITIONALLY)) {
          this._removeFlag(this.FLAG_CLEAN_CONDITIONALLY);
        } else {
          // No luck after removing flags, just return the longest text we found during the different loops
          this._attempts.sort(function (a, b) {
            return b.textLength - a.textLength;
          });

          // But first check if we actually have something
          if (!this._attempts[0].textLength) {
            return null;
          }

          articleContent = this._attempts[0].articleContent;
          parseSuccessful = true;
        }
      }

      if (parseSuccessful) {
        // Find out text direction from ancestors of final top candidate.
        var ancestors = [parentOfTopCandidate, topCandidate].concat(
          this._getNodeAncestors(parentOfTopCandidate)
        );
        this._someNode(ancestors, function (ancestor) {
          if (!ancestor.tagName) {
            return false;
          }
          var articleDir = ancestor.getAttribute("dir");
          if (articleDir) {
            this._articleDir = articleDir;
            return true;
          }
          return false;
        });
        return articleContent;
      }
    }
  },

  /**
   * Converts some of the common HTML entities in string to their corresponding characters.
   *
   * @param str {string} - a string to unescape.
   * @return string without HTML entity.
   */
  _unescapeHtmlEntities(str) {
    if (!str) {
      return str;
    }

    var htmlEscapeMap = this.HTML_ESCAPE_MAP;
    return str
      .replace(/&(quot|amp|apos|lt|gt);/g, function (_, tag) {
        return htmlEscapeMap[tag];
      })
      .replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, function (_, hex, numStr) {
        var num = parseInt(hex || numStr, hex ? 16 : 10);

        // these character references are replaced by a conforming HTML parser
        if (num == 0 || num > 0x10ffff || (num >= 0xd800 && num <= 0xdfff)) {
          num = 0xfffd;
        }

        return String.fromCodePoint(num);
      });
  },

  /**
   * Try to extract metadata from JSON-LD object.
   * For now, only Schema.org objects of type Article or its subtypes are supported.
   * @return Object with any metadata that could be extracted (possibly none)
   */
  _getJSONLD(doc) {
    var scripts = this._getAllNodesWithTag(doc, ["script"]);

    var metadata;

    this._forEachNode(scripts, function (jsonLdElement) {
      if (
        !metadata &&
        jsonLdElement.getAttribute("type") === "application/ld+json"
      ) {
        try {
          // Strip CDATA markers if present
          var content = jsonLdElement.textContent.replace(
            /^\s*<!\[CDATA\[|\]\]>\s*$/g,
            ""
          );
          var parsed = JSON.parse(content);

          if (Array.isArray(parsed)) {
            parsed = parsed.find(it => {
              return (
                it["@type"] &&
                it["@type"].match(this.REGEXPS.jsonLdArticleTypes)
              );
            });
            if (!parsed) {
              return;
            }
          }

          var schemaDotOrgRegex = /^https?\:\/\/schema\.org\/?$/;
          var matches =
            (typeof parsed["@context"] === "string" &&
              parsed["@context"].match(schemaDotOrgRegex)) ||
            (typeof parsed["@context"] === "object" &&
              typeof parsed["@context"]["@vocab"] == "string" &&
              parsed["@context"]["@vocab"].match(schemaDotOrgRegex));

          if (!matches) {
            return;
          }

          if (!parsed["@type"] && Array.isArray(parsed["@graph"])) {
            parsed = parsed["@graph"].find(it => {
              return (it["@type"] || "").match(this.REGEXPS.jsonLdArticleTypes);
            });
          }

          if (
            !parsed ||
            !parsed["@type"] ||
            !parsed["@type"].match(this.REGEXPS.jsonLdArticleTypes)
          ) {
            return;
          }

          metadata = {};

          if (
            typeof parsed.name === "string" &&
            typeof parsed.headline === "string" &&
            parsed.name !== parsed.headline
          ) {
            // we have both name and headline element in the JSON-LD. They should both be the same but some websites like aktualne.cz
            // put their own name into "name" and the article title to "headline" which confuses Readability. So we try to check if either
            // "name" or "headline" closely matches the html title, and if so, use that one. If not, then we use "name" by default.

            var title = this._getArticleTitle();
            var nameMatches = this._textSimilarity(parsed.name, title) > 0.75;
            var headlineMatches =
              this._textSimilarity(parsed.headline, title) > 0.75;

            if (headlineMatches && !nameMatches) {
              metadata.title = parsed.headline;
            } else {
              metadata.title = parsed.name;
            }
          } else if (typeof parsed.name === "string") {
            metadata.title = parsed.name.trim();
          } else if (typeof parsed.headline === "string") {
            metadata.title = parsed.headline.trim();
          }
          if (parsed.author) {
            if (typeof parsed.author.name === "string") {
              metadata.byline = parsed.author.name.trim();
            } else if (
              Array.isArray(parsed.author) &&
              parsed.author[0] &&
              typeof parsed.author[0].name === "string"
            ) {
              metadata.byline = parsed.author
                .filter(function (author) {
                  return author && typeof author.name === "string";
                })
                .map(function (author) {
                  return author.name.trim();
                })
                .join(", ");
            }
          }
          if (typeof parsed.description === "string") {
            metadata.excerpt = parsed.description.trim();
          }
          if (parsed.publisher && typeof parsed.publisher.name === "string") {
            metadata.siteName = parsed.publisher.name.trim();
          }
          if (typeof parsed.datePublished === "string") {
            metadata.datePublished = parsed.datePublished.trim();
          }
        } catch (err) {
          this.log(err.message);
        }
      }
    });
    return metadata ? metadata : {};
  },

  /**
   * Attempts to get excerpt and byline metadata for the article.
   *
   * @param {Object} jsonld — object containing any metadata that
   * could be extracted from JSON-LD object.
   *
   * @return Object with optional "excerpt" and "byline" properties
   */
  _getArticleMetadata(jsonld) {
    var metadata = {};
    var values = {};
    var metaElements = this._doc.getElementsByTagName("meta");

    // property is a space-separated list of values
    var propertyPattern =
      /\s*(article|dc|dcterm|og|twitter)\s*:\s*(author|creator|description|published_time|title|site_name)\s*/gi;

    // name is a single value
    var namePattern =
      /^\s*(?:(dc|dcterm|og|twitter|parsely|weibo:(article|webpage))\s*[-\.:]\s*)?(author|creator|pub-date|description|title|site_name)\s*$/i;

    // Find description tags.
    this._forEachNode(metaElements, function (element) {
      var elementName = element.getAttribute("name");
      var elementProperty = element.getAttribute("property");
      var content = element.getAttribute("content");
      if (!content) {
        return;
      }
      var matches = null;
      var name = null;

      if (elementProperty) {
        matches = elementProperty.match(propertyPattern);
        if (matches) {
          // Convert to lowercase, and remove any whitespace
          // so we can match below.
          name = matches[0].toLowerCase().replace(/\s/g, "");
          // multiple authors
          values[name] = content.trim();
        }
      }
      if (!matches && elementName && namePattern.test(elementName)) {
        name = elementName;
        if (content) {
          // Convert to lowercase, remove any whitespace, and convert dots
          // to colons so we can match below.
          name = name.toLowerCase().replace(/\s/g, "").replace(/\./g, ":");
          values[name] = content.trim();
        }
      }
    });

    // get title
    metadata.title =
      jsonld.title ||
      values["dc:title"] ||
      values["dcterm:title"] ||
      values["og:title"] ||
      values["weibo:article:title"] ||
      values["weibo:webpage:title"] ||
      values.title ||
      values["twitter:title"] ||
      values["parsely-title"];

    if (!metadata.title) {
      metadata.title = this._getArticleTitle();
    }

    const articleAuthor =
      typeof values["article:author"] === "string" &&
      !this._isUrl(values["article:author"])
        ? values["article:author"]
        : undefined;

    // get author
    metadata.byline =
      jsonld.byline ||
      values["dc:creator"] ||
      values["dcterm:creator"] ||
      values.author ||
      values["parsely-author"] ||
      articleAuthor;

    // get description
    metadata.excerpt =
      jsonld.excerpt ||
      values["dc:description"] ||
      values["dcterm:description"] ||
      values["og:description"] ||
      values["weibo:article:description"] ||
      values["weibo:webpage:description"] ||
      values.description ||
      values["twitter:description"];

    // get site name
    metadata.siteName = jsonld.siteName || values["og:site_name"];

    // get article published time
    metadata.publishedTime =
      jsonld.datePublished ||
      values["article:published_time"] ||
      values["parsely-pub-date"] ||
      null;

    // in many sites the meta value is escaped with HTML entities,
    // so here we need to unescape it
    metadata.title = this._unescapeHtmlEntities(metadata.title);
    metadata.byline = this._unescapeHtmlEntities(metadata.byline);
    metadata.excerpt = this._unescapeHtmlEntities(metadata.excerpt);
    metadata.siteName = this._unescapeHtmlEntities(metadata.siteName);
    metadata.publishedTime = this._unescapeHtmlEntities(metadata.publishedTime);

    return metadata;
  },

  /**
   * Check if node is image, or if node contains exactly only one image
   * whether as a direct child or as its descendants.
   *
   * @param Element
   **/
  _isSingleImage(node) {
    while (node) {
      if (node.tagName === "IMG") {
        return true;
      }
      if (node.children.length !== 1 || node.textContent.trim() !== "") {
        return false;
      }
      node = node.children[0];
    }
    return false;
  },

  /**
   * Find all <noscript> that are located after <img> nodes, and which contain only one
   * <img> element. Replace the first image with the image from inside the <noscript> tag,
   * and remove the <noscript> tag. This improves the quality of the images we use on
   * some sites (e.g. Medium).
   *
   * @param Element
   **/
  _unwrapNoscriptImages(doc) {
    // Find img without source or attributes that might contains image, and remove it.
    // This is done to prevent a placeholder img is replaced by img from noscript in next step.
    var imgs = Array.from(doc.getElementsByTagName("img"));
    this._forEachNode(imgs, function (img) {
      for (var i = 0; i < img.attributes.length; i++) {
        var attr = img.attributes[i];
        switch (attr.name) {
          case "src":
          case "srcset":
          case "data-src":
          case "data-srcset":
            return;
        }

        if (/\.(jpg|jpeg|png|webp)/i.test(attr.value)) {
          return;
        }
      }

      img.remove();
    });

    // Next find noscript and try to extract its image
    var noscripts = Array.from(doc.getElementsByTagName("noscript"));
    this._forEachNode(noscripts, function (noscript) {
      // Parse content of noscript and make sure it only contains image
      if (!this._isSingleImage(noscript)) {
        return;
      }
      var tmp = doc.createElement("div");
      // We're running in the document context, and using unmodified
      // document contents, so doing this should be safe.
      // (Also we heavily discourage people from allowing script to
      // run at all in this document...)
      // eslint-disable-next-line no-unsanitized/property
      tmp.innerHTML = noscript.innerHTML;

      // If noscript has previous sibling and it only contains image,
      // replace it with noscript content. However we also keep old
      // attributes that might contains image.
      var prevElement = noscript.previousElementSibling;
      if (prevElement && this._isSingleImage(prevElement)) {
        var prevImg = prevElement;
        if (prevImg.tagName !== "IMG") {
          prevImg = prevElement.getElementsByTagName("img")[0];
        }

        var newImg = tmp.getElementsByTagName("img")[0];
        for (var i = 0; i < prevImg.attributes.length; i++) {
          var attr = prevImg.attributes[i];
          if (attr.value === "") {
            continue;
          }

          if (
            attr.name === "src" ||
            attr.name === "srcset" ||
            /\.(jpg|jpeg|png|webp)/i.test(attr.value)
          ) {
            if (newImg.getAttribute(attr.name) === attr.value) {
              continue;
            }

            var attrName = attr.name;
            if (newImg.hasAttribute(attrName)) {
              attrName = "data-old-" + attrName;
            }

            newImg.setAttribute(attrName, attr.value);
          }
        }

        noscript.parentNode.replaceChild(tmp.firstElementChild, prevElement);
      }
    });
  },

  /**
   * Removes script tags from the document.
   *
   * @param Element
   **/
  _removeScripts(doc) {
    this._removeNodes(this._getAllNodesWithTag(doc, ["script", "noscript"]));
  },

  /**
   * Check if this node has only whitespace and a single element with given tag
   * Returns false if the DIV node contains non-empty text nodes
   * or if it contains no element with given tag or more than 1 element.
   *
   * @param Element
   * @param string tag of child element
   **/
  _hasSingleTagInsideElement(element, tag) {
    // There should be exactly 1 element child with given tag
    if (element.children.length != 1 || element.children[0].tagName !== tag) {
      return false;
    }

    // And there should be no text nodes with real content
    return !this._someNode(element.childNodes, function (node) {
      return (
        node.nodeType === this.TEXT_NODE &&
        this.REGEXPS.hasContent.test(node.textContent)
      );
    });
  },

  _isElementWithoutContent(node) {
    return (
      node.nodeType === this.ELEMENT_NODE &&
      !node.textContent.trim().length &&
      (!node.children.length ||
        node.children.length ==
          node.getElementsByTagName("br").length +
            node.getElementsByTagName("hr").length)
    );
  },

  /**
   * Determine whether element has any children block level elements.
   *
   * @param Element
   */
  _hasChildBlockElement(element) {
    return this._someNode(element.childNodes, function (node) {
      return (
        this.DIV_TO_P_ELEMS.has(node.tagName) ||
        this._hasChildBlockElement(node)
      );
    });
  },

  /***
   * Determine if a node qualifies as phrasing content.
   * https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/Content_categories#Phrasing_content
   **/
  _isPhrasingContent(node) {
    return (
      node.nodeType === this.TEXT_NODE ||
      this.PHRASING_ELEMS.includes(node.tagName) ||
      ((node.tagName === "A" ||
        node.tagName === "DEL" ||
        node.tagName === "INS") &&
        this._everyNode(node.childNodes, this._isPhrasingContent))
    );
  },

  _isWhitespace(node) {
    return (
      (node.nodeType === this.TEXT_NODE &&
        node.textContent.trim().length === 0) ||
      (node.nodeType === this.ELEMENT_NODE && node.tagName === "BR")
    );
  },

  /**
   * Get the inner text of a node - cross browser compatibly.
   * This also strips out any excess whitespace to be found.
   *
   * @param Element
   * @param Boolean normalizeSpaces (default: true)
   * @return string
   **/
  _getInnerText(e, normalizeSpaces) {
    normalizeSpaces =
      typeof normalizeSpaces === "undefined" ? true : normalizeSpaces;
    var textContent = e.textContent.trim();

    if (normalizeSpaces) {
      return textContent.replace(this.REGEXPS.normalize, " ");
    }
    return textContent;
  },

  /**
   * Get the number of times a string s appears in the node e.
   *
   * @param Element
   * @param string - what to split on. Default is ","
   * @return number (integer)
   **/
  _getCharCount(e, s) {
    s = s || ",";
    return this._getInnerText(e).split(s).length - 1;
  },

  /**
   * Remove the style attribute on every e and under.
   * TODO: Test if getElementsByTagName(*) is faster.
   *
   * @param Element
   * @return void
   **/
  _cleanStyles(e) {
    if (!e || e.tagName.toLowerCase() === "svg") {
      return;
    }

    // Remove `style` and deprecated presentational attributes
    for (var i = 0; i < this.PRESENTATIONAL_ATTRIBUTES.length; i++) {
      e.removeAttribute(this.PRESENTATIONAL_ATTRIBUTES[i]);
    }

    if (this.DEPRECATED_SIZE_ATTRIBUTE_ELEMS.includes(e.tagName)) {
      e.removeAttribute("width");
      e.removeAttribute("height");
    }

    var cur = e.firstElementChild;
    while (cur !== null) {
      this._cleanStyles(cur);
      cur = cur.nextElementSibling;
    }
  },

  /**
   * Get the density of links as a percentage of the content
   * This is the amount of text that is inside a link divided by the total text in the node.
   *
   * @param Element
   * @return number (float)
   **/
  _getLinkDensity(element) {
    var textLength = this._getInnerText(element).length;
    if (textLength === 0) {
      return 0;
    }

    var linkLength = 0;

    // XXX implement _reduceNodeList?
    this._forEachNode(element.getElementsByTagName("a"), function (linkNode) {
      var href = linkNode.getAttribute("href");
      var coefficient = href && this.REGEXPS.hashUrl.test(href) ? 0.3 : 1;
      linkLength += this._getInnerText(linkNode).length * coefficient;
    });

    return linkLength / textLength;
  },

  /**
   * Get an elements class/id weight. Uses regular expressions to tell if this
   * element looks good or bad.
   *
   * @param Element
   * @return number (Integer)
   **/
  _getClassWeight(e) {
    if (!this._flagIsActive(this.FLAG_WEIGHT_CLASSES)) {
      return 0;
    }

    var weight = 0;

    // Look for a special classname
    if (typeof e.className === "string" && e.className !== "") {
      if (this.REGEXPS.negative.test(e.className)) {
        weight -= 25;
      }

      if (this.REGEXPS.positive.test(e.className)) {
        weight += 25;
      }
    }

    // Look for a special ID
    if (typeof e.id === "string" && e.id !== "") {
      if (this.REGEXPS.negative.test(e.id)) {
        weight -= 25;
      }

      if (this.REGEXPS.positive.test(e.id)) {
        weight += 25;
      }
    }

    return weight;
  },

  /**
   * Clean a node of all elements of type "tag".
   * (Unless it's a youtube/vimeo video. People love movies.)
   *
   * @param Element
   * @param string tag to clean
   * @return void
   **/
  _clean(e, tag) {
    var isEmbed = ["object", "embed", "iframe"].includes(tag);

    this._removeNodes(this._getAllNodesWithTag(e, [tag]), function (element) {
      // Allow youtube and vimeo videos through as people usually want to see those.
      if (isEmbed) {
        // First, check the elements attributes to see if any of them contain youtube or vimeo
        for (var i = 0; i < element.attributes.length; i++) {
          if (this._allowedVideoRegex.test(element.attributes[i].value)) {
            return false;
          }
        }

        // For embed with <object> tag, check inner HTML as well.
        if (
          element.tagName === "object" &&
          this._allowedVideoRegex.test(element.innerHTML)
        ) {
          return false;
        }
      }

      return true;
    });
  },

  /**
   * Check if a given node has one of its ancestor tag name matching the
   * provided one.
   * @param  HTMLElement node
   * @param  String      tagName
   * @param  Number      maxDepth
   * @param  Function    filterFn a filter to invoke to determine whether this node 'counts'
   * @return Boolean
   */
  _hasAncestorTag(node, tagName, maxDepth, filterFn) {
    maxDepth = maxDepth || 3;
    tagName = tagName.toUpperCase();
    var depth = 0;
    while (node.parentNode) {
      if (maxDepth > 0 && depth > maxDepth) {
        return false;
      }
      if (
        node.parentNode.tagName === tagName &&
        (!filterFn || filterFn(node.parentNode))
      ) {
        return true;
      }
      node = node.parentNode;
      depth++;
    }
    return false;
  },

  /**
   * Return an object indicating how many rows and columns this table has.
   */
  _getRowAndColumnCount(table) {
    var rows = 0;
    var columns = 0;
    var trs = table.getElementsByTagName("tr");
    for (var i = 0; i < trs.length; i++) {
      var rowspan = trs[i].getAttribute("rowspan") || 0;
      if (rowspan) {
        rowspan = parseInt(rowspan, 10);
      }
      rows += rowspan || 1;

      // Now look for column-related info
      var columnsInThisRow = 0;
      var cells = trs[i].getElementsByTagName("td");
      for (var j = 0; j < cells.length; j++) {
        var colspan = cells[j].getAttribute("colspan") || 0;
        if (colspan) {
          colspan = parseInt(colspan, 10);
        }
        columnsInThisRow += colspan || 1;
      }
      columns = Math.max(columns, columnsInThisRow);
    }
    return { rows, columns };
  },

  /**
   * Look for 'data' (as opposed to 'layout') tables, for which we use
   * similar checks as
   * https://searchfox.org/mozilla-central/rev/f82d5c549f046cb64ce5602bfd894b7ae807c8f8/accessible/generic/TableAccessible.cpp#19
   */
  _markDataTables(root) {
    var tables = root.getElementsByTagName("table");
    for (var i = 0; i < tables.length; i++) {
      var table = tables[i];
      var role = table.getAttribute("role");
      if (role == "presentation") {
        table._readabilityDataTable = false;
        continue;
      }
      var datatable = table.getAttribute("datatable");
      if (datatable == "0") {
        table._readabilityDataTable = false;
        continue;
      }
      var summary = table.getAttribute("summary");
      if (summary) {
        table._readabilityDataTable = true;
        continue;
      }

      var caption = table.getElementsByTagName("caption")[0];
      if (caption && caption.childNodes.length) {
        table._readabilityDataTable = true;
        continue;
      }

      // If the table has a descendant with any of these tags, consider a data table:
      var dataTableDescendants = ["col", "colgroup", "tfoot", "thead", "th"];
      var descendantExists = function (tag) {
        return !!table.getElementsByTagName(tag)[0];
      };
      if (dataTableDescendants.some(descendantExists)) {
        this.log("Data table because found data-y descendant");
        table._readabilityDataTable = true;
        continue;
      }

      // Nested tables indicate a layout table:
      if (table.getElementsByTagName("table")[0]) {
        table._readabilityDataTable = false;
        continue;
      }

      var sizeInfo = this._getRowAndColumnCount(table);

      if (sizeInfo.columns == 1 || sizeInfo.rows == 1) {
        // single colum/row tables are commonly used for page layout purposes.
        table._readabilityDataTable = false;
        continue;
      }

      if (sizeInfo.rows >= 10 || sizeInfo.columns > 4) {
        table._readabilityDataTable = true;
        continue;
      }
      // Now just go by size entirely:
      table._readabilityDataTable = sizeInfo.rows * sizeInfo.columns > 10;
    }
  },

  /* convert images and figures that have properties like data-src into images that can be loaded without JS */
  _fixLazyImages(root) {
    this._forEachNode(
      this._getAllNodesWithTag(root, ["img", "picture", "figure"]),
      function (elem) {
        // In some sites (e.g. Kotaku), they put 1px square image as base64 data uri in the src attribute.
        // So, here we check if the data uri is too short, just might as well remove it.
        if (elem.src && this.REGEXPS.b64DataUrl.test(elem.src)) {
          // Make sure it's not SVG, because SVG can have a meaningful image in under 133 bytes.
          var parts = this.REGEXPS.b64DataUrl.exec(elem.src);
          if (parts[1] === "image/svg+xml") {
            return;
          }

          // Make sure this element has other attributes which contains image.
          // If it doesn't, then this src is important and shouldn't be removed.
          var srcCouldBeRemoved = false;
          for (var i = 0; i < elem.attributes.length; i++) {
            var attr = elem.attributes[i];
            if (attr.name === "src") {
              continue;
            }

            if (/\.(jpg|jpeg|png|webp)/i.test(attr.value)) {
              srcCouldBeRemoved = true;
              break;
            }
          }

          // Here we assume if image is less than 100 bytes (or 133 after encoded to base64)
          // it will be too small, therefore it might be placeholder image.
          if (srcCouldBeRemoved) {
            var b64starts = parts[0].length;
            var b64length = elem.src.length - b64starts;
            if (b64length < 133) {
              elem.removeAttribute("src");
            }
          }
        }

        // also check for "null" to work around https://github.com/jsdom/jsdom/issues/2580
        if (
          (elem.src || (elem.srcset && elem.srcset != "null")) &&
          !elem.className.toLowerCase().includes("lazy")
        ) {
          return;
        }

        for (var j = 0; j < elem.attributes.length; j++) {
          attr = elem.attributes[j];
          if (
            attr.name === "src" ||
            attr.name === "srcset" ||
            attr.name === "alt"
          ) {
            continue;
          }
          var copyTo = null;
          if (/\.(jpg|jpeg|png|webp)\s+\d/.test(attr.value)) {
            copyTo = "srcset";
          } else if (/^\s*\S+\.(jpg|jpeg|png|webp)\S*\s*$/.test(attr.value)) {
            copyTo = "src";
          }
          if (copyTo) {
            //if this is an img or picture, set the attribute directly
            if (elem.tagName === "IMG" || elem.tagName === "PICTURE") {
              elem.setAttribute(copyTo, attr.value);
            } else if (
              elem.tagName === "FIGURE" &&
              !this._getAllNodesWithTag(elem, ["img", "picture"]).length
            ) {
              //if the item is a <figure> that does not contain an image or picture, create one and place it inside the figure
              //see the nytimes-3 testcase for an example
              var img = this._doc.createElement("img");
              img.setAttribute(copyTo, attr.value);
              elem.appendChild(img);
            }
          }
        }
      }
    );
  },

  _getTextDensity(e, tags) {
    var textLength = this._getInnerText(e, true).length;
    if (textLength === 0) {
      return 0;
    }
    var childrenLength = 0;
    var children = this._getAllNodesWithTag(e, tags);
    this._forEachNode(
      children,
      child => (childrenLength += this._getInnerText(child, true).length)
    );
    return childrenLength / textLength;
  },

  /**
   * Clean an element of all tags of type "tag" if they look fishy.
   * "Fishy" is an algorithm based on content length, classnames, link density, number of images & embeds, etc.
   *
   * @return void
   **/
  _cleanConditionally(e, tag) {
    if (!this._flagIsActive(this.FLAG_CLEAN_CONDITIONALLY)) {
      return;
    }

    // Gather counts for other typical elements embedded within.
    // Traverse backwards so we can remove nodes at the same time
    // without effecting the traversal.
    //
    // TODO: Consider taking into account original contentScore here.
    this._removeNodes(this._getAllNodesWithTag(e, [tag]), function (node) {
      // First check if this node IS data table, in which case don't remove it.
      var isDataTable = function (t) {
        return t._readabilityDataTable;
      };

      var isList = tag === "ul" || tag === "ol";
      if (!isList) {
        var listLength = 0;
        var listNodes = this._getAllNodesWithTag(node, ["ul", "ol"]);
        this._forEachNode(
          listNodes,
          list => (listLength += this._getInnerText(list).length)
        );
        isList = listLength / this._getInnerText(node).length > 0.9;
      }

      if (tag === "table" && isDataTable(node)) {
        return false;
      }

      // Next check if we're inside a data table, in which case don't remove it as well.
      if (this._hasAncestorTag(node, "table", -1, isDataTable)) {
        return false;
      }

      if (this._hasAncestorTag(node, "code")) {
        return false;
      }

      // keep element if it has a data tables
      if (
        [...node.getElementsByTagName("table")].some(
          tbl => tbl._readabilityDataTable
        )
      ) {
        return false;
      }

      var weight = this._getClassWeight(node);

      this.log("Cleaning Conditionally", node);

      var contentScore = 0;

      if (weight + contentScore < 0) {
        return true;
      }

      if (this._getCharCount(node, ",") < 10) {
        // If there are not very many commas, and the number of
        // non-paragraph elements is more than paragraphs or other
        // ominous signs, remove the element.
        var p = node.getElementsByTagName("p").length;
        var img = node.getElementsByTagName("img").length;
        var li = node.getElementsByTagName("li").length - 100;
        var input = node.getElementsByTagName("input").length;
        var headingDensity = this._getTextDensity(node, [
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
        ]);

        var embedCount = 0;
        var embeds = this._getAllNodesWithTag(node, [
          "object",
          "embed",
          "iframe",
        ]);

        for (var i = 0; i < embeds.length; i++) {
          // If this embed has attribute that matches video regex, don't delete it.
          for (var j = 0; j < embeds[i].attributes.length; j++) {
            if (this._allowedVideoRegex.test(embeds[i].attributes[j].value)) {
              return false;
            }
          }

          // For embed with <object> tag, check inner HTML as well.
          if (
            embeds[i].tagName === "object" &&
            this._allowedVideoRegex.test(embeds[i].innerHTML)
          ) {
            return false;
          }

          embedCount++;
        }

        var innerText = this._getInnerText(node);

        // toss any node whose inner text contains nothing but suspicious words
        if (
          this.REGEXPS.adWords.test(innerText) ||
          this.REGEXPS.loadingWords.test(innerText)
        ) {
          return true;
        }

        var contentLength = innerText.length;
        var linkDensity = this._getLinkDensity(node);
        var textishTags = ["SPAN", "LI", "TD"].concat(
          Array.from(this.DIV_TO_P_ELEMS)
        );
        var textDensity = this._getTextDensity(node, textishTags);
        var isFigureChild = this._hasAncestorTag(node, "figure");

        // apply shadiness checks, then check for exceptions
        const shouldRemoveNode = () => {
          const errs = [];
          if (!isFigureChild && img > 1 && p / img < 0.5) {
            errs.push(`Bad p to img ratio (img=${img}, p=${p})`);
          }
          if (!isList && li > p) {
            errs.push(`Too many li's outside of a list. (li=${li} > p=${p})`);
          }
          if (input > Math.floor(p / 3)) {
            errs.push(`Too many inputs per p. (input=${input}, p=${p})`);
          }
          if (
            !isList &&
            !isFigureChild &&
            headingDensity < 0.9 &&
            contentLength < 25 &&
            (img === 0 || img > 2) &&
            linkDensity > 0
          ) {
            errs.push(
              `Suspiciously short. (headingDensity=${headingDensity}, img=${img}, linkDensity=${linkDensity})`
            );
          }
          if (
            !isList &&
            weight < 25 &&
            linkDensity > 0.2 + this._linkDensityModifier
          ) {
            errs.push(
              `Low weight and a little linky. (linkDensity=${linkDensity})`
            );
          }
          if (weight >= 25 && linkDensity > 0.5 + this._linkDensityModifier) {
            errs.push(
              `High weight and mostly links. (linkDensity=${linkDensity})`
            );
          }
          if ((embedCount === 1 && contentLength < 75) || embedCount > 1) {
            errs.push(
              `Suspicious embed. (embedCount=${embedCount}, contentLength=${contentLength})`
            );
          }
          if (img === 0 && textDensity === 0) {
            errs.push(
              `No useful content. (img=${img}, textDensity=${textDensity})`
            );
          }

          if (errs.length) {
            this.log("Checks failed", errs);
            return true;
          }

          return false;
        };

        var haveToRemove = shouldRemoveNode();

        // Allow simple lists of images to remain in pages
        if (isList && haveToRemove) {
          for (var x = 0; x < node.children.length; x++) {
            let child = node.children[x];
            // Don't filter in lists with li's that contain more than one child
            if (child.children.length > 1) {
              return haveToRemove;
            }
          }
          let li_count = node.getElementsByTagName("li").length;
          // Only allow the list to remain if every li contains an image
          if (img == li_count) {
            return false;
          }
        }
        return haveToRemove;
      }
      return false;
    });
  },

  /**
   * Clean out elements that match the specified conditions
   *
   * @param Element
   * @param Function determines whether a node should be removed
   * @return void
   **/
  _cleanMatchedNodes(e, filter) {
    var endOfSearchMarkerNode = this._getNextNode(e, true);
    var next = this._getNextNode(e);
    while (next && next != endOfSearchMarkerNode) {
      if (filter.call(this, next, next.className + " " + next.id)) {
        next = this._removeAndGetNext(next);
      } else {
        next = this._getNextNode(next);
      }
    }
  },

  /**
   * Clean out spurious headers from an Element.
   *
   * @param Element
   * @return void
   **/
  _cleanHeaders(e) {
    let headingNodes = this._getAllNodesWithTag(e, ["h1", "h2"]);
    this._removeNodes(headingNodes, function (node) {
      let shouldRemove = this._getClassWeight(node) < 0;
      if (shouldRemove) {
        this.log("Removing header with low class weight:", node);
      }
      return shouldRemove;
    });
  },

  /**
   * Check if this node is an H1 or H2 element whose content is mostly
   * the same as the article title.
   *
   * @param Element  the node to check.
   * @return boolean indicating whether this is a title-like header.
   */
  _headerDuplicatesTitle(node) {
    if (node.tagName != "H1" && node.tagName != "H2") {
      return false;
    }
    var heading = this._getInnerText(node, false);
    this.log("Evaluating similarity of header:", heading, this._articleTitle);
    return this._textSimilarity(this._articleTitle, heading) > 0.75;
  },

  _flagIsActive(flag) {
    return (this._flags & flag) > 0;
  },

  _removeFlag(flag) {
    this._flags = this._flags & ~flag;
  },

  _isProbablyVisible(node) {
    // Have to null-check node.style and node.className.includes to deal with SVG and MathML nodes.
    return (
      (!node.style || node.style.display != "none") &&
      (!node.style || node.style.visibility != "hidden") &&
      !node.hasAttribute("hidden") &&
      //check for "fallback-image" so that wikimedia math images are displayed
      (!node.hasAttribute("aria-hidden") ||
        node.getAttribute("aria-hidden") != "true" ||
        (node.className &&
          node.className.includes &&
          node.className.includes("fallback-image")))
    );
  },

  /**
   * Runs readability.
   *
   * Workflow:
   *  1. Prep the document by removing script tags, css, etc.
   *  2. Build readability's DOM tree.
   *  3. Grab the article content from the current dom tree.
   *  4. Replace the current DOM tree with the new one.
   *  5. Read peacefully.
   *
   * @return void
   **/
  parse() {
    // Avoid parsing too large documents, as per configuration option
    if (this._maxElemsToParse > 0) {
      var numTags = this._doc.getElementsByTagName("*").length;
      if (numTags > this._maxElemsToParse) {
        throw new Error(
          "Aborting parsing document; " + numTags + " elements found"
        );
      }
    }

    // Unwrap image from noscript
    this._unwrapNoscriptImages(this._doc);

    // Extract JSON-LD metadata before removing scripts
    var jsonLd = this._disableJSONLD ? {} : this._getJSONLD(this._doc);

    // Remove script tags from the document.
    this._removeScripts(this._doc);

    this._prepDocument();

    var metadata = this._getArticleMetadata(jsonLd);
    this._metadata = metadata;
    this._articleTitle = metadata.title;

    var articleContent = this._grabArticle();
    if (!articleContent) {
      return null;
    }

    this.log("Grabbed: " + articleContent.innerHTML);

    this._postProcessContent(articleContent);

    // If we haven't found an excerpt in the article's metadata, use the article's
    // first paragraph as the excerpt. This is used for displaying a preview of
    // the article's content.
    if (!metadata.excerpt) {
      var paragraphs = articleContent.getElementsByTagName("p");
      if (paragraphs.length) {
        metadata.excerpt = paragraphs[0].textContent.trim();
      }
    }

    var textContent = articleContent.textContent;
    return {
      title: this._articleTitle,
      byline: metadata.byline || this._articleByline,
      dir: this._articleDir,
      lang: this._articleLang,
      content: this._serializer(articleContent),
      textContent,
      length: textContent.length,
      excerpt: metadata.excerpt,
      siteName: metadata.siteName || this._articleSiteName,
      publishedTime: metadata.publishedTime,
    };
  },
};

if (typeof module === "object") {
  /* eslint-disable-next-line no-redeclare */
  /* global module */
  module.exports = Readability;
}

/*! @license DOMPurify 3.4.17 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.17/LICENSE */
(function(global, factory) {
	typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define([], factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, global.DOMPurify = factory());
})(this, function() {
	"use strict";
	function _OverloadYield(e, d) {
		this.v = e, this.k = d;
	}
	function _arrayLikeToArray(r, a) {
		(null == a || a > r.length) && (a = r.length);
		for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
		return n;
	}
	function _arrayWithHoles(r) {
		if (Array.isArray(r)) return r;
	}
	function _iterableToArrayLimit(r, l) {
		var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
		if (null != t) {
			var e, n, i, u, a = [], f = !0, o = !1;
			try {
				if (i = (t = t.call(r)).next, 0 === l) {
					if (Object(t) !== t) return;
					f = !1;
				} else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0);
			} catch (r) {
				o = !0, n = r;
			} finally {
				try {
					if (!f && null != t.return && (u = t.return(), Object(u) !== u)) return;
				} finally {
					if (o) throw n;
				}
			}
			return a;
		}
	}
	function _nonIterableRest() {
		throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
	}
	/*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */
	function _slicedToArray(r, e) {
		return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest();
	}
	function _unsupportedIterableToArray(r, a) {
		if (r) {
			if ("string" == typeof r) return _arrayLikeToArray(r, a);
			var t = {}.toString.call(r).slice(8, -1);
			return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
		}
	}
	function AsyncGenerator(e) {
		var t, n;
		function resume(t, n) {
			try {
				var r = e[t](n), o = r.value, u = o instanceof _OverloadYield;
				Promise.resolve(u ? o.v : o).then(function(n) {
					if (u) {
						var i = "return" === t && o.k ? t : "next";
						if (!o.k || n.done) return resume(i, n);
						n = e[i](n).value;
					}
					settle(!!r.done, n);
				}, function(e) {
					resume("throw", e);
				});
			} catch (e) {
				settle(2, e);
			}
		}
		function settle(e, r) {
			2 === e ? t.reject(r) : t.resolve({
				value: r,
				done: e
			}), (t = t.next) ? resume(t.key, t.arg) : n = null;
		}
		this._invoke = function(e, r) {
			return new Promise(function(o, u) {
				var i = {
					key: e,
					arg: r,
					resolve: o,
					reject: u,
					next: null
				};
				n ? n = n.next = i : (t = n = i, resume(e, r));
			});
		}, "function" != typeof e.return && (this.return = void 0);
	}
	AsyncGenerator.prototype["function" == typeof Symbol && Symbol.asyncIterator || "@@asyncIterator"] = function() {
		return this;
	}, AsyncGenerator.prototype.next = function(e) {
		return this._invoke("next", e);
	}, AsyncGenerator.prototype.throw = function(e) {
		return this._invoke("throw", e);
	}, AsyncGenerator.prototype.return = function(e) {
		return this._invoke("return", e);
	};
	const entries = Object.entries;
	const setPrototypeOf = Object.setPrototypeOf;
	const isFrozen = Object.isFrozen;
	const getPrototypeOf = Object.getPrototypeOf;
	const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
	let freeze = Object.freeze;
	let seal = Object.seal;
	let create = Object.create;
	let _ref = typeof Reflect !== "undefined" && Reflect;
	let apply = _ref.apply;
	let construct = _ref.construct;
	if (!freeze) freeze = function freeze(x) {
		return x;
	};
	if (!seal) seal = function seal(x) {
		return x;
	};
	if (!apply) apply = function apply(func, thisArg) {
		for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) args[_key - 2] = arguments[_key];
		return func.apply(thisArg, args);
	};
	if (!construct) construct = function construct(Func) {
		for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) args[_key2 - 1] = arguments[_key2];
		return new Func(...args);
	};
	const arrayForEach = unapply(Array.prototype.forEach);
	Array.prototype.indexOf;
	const arrayLastIndexOf = unapply(Array.prototype.lastIndexOf);
	const arrayPop = unapply(Array.prototype.pop);
	const arrayPush = unapply(Array.prototype.push);
	const arraySlice = unapply(Array.prototype.slice);
	const arraySplice = unapply(Array.prototype.splice);
	const arrayIsArray = Array.isArray;
	const setCreate = unconstruct(Set);
	const setAdd = unapply(Set.prototype.add);
	const setHas = unapply(Set.prototype.has);
	const stringToLowerCase = unapply(String.prototype.toLowerCase);
	const stringToString = unapply(String.prototype.toString);
	const stringMatch = unapply(String.prototype.match);
	const stringReplace = unapply(String.prototype.replace);
	const stringIndexOf = unapply(String.prototype.indexOf);
	const stringTrim = unapply(String.prototype.trim);
	const numberToString = unapply(Number.prototype.toString);
	const booleanToString = unapply(Boolean.prototype.toString);
	const bigintToString = typeof BigInt === "undefined" ? null : unapply(BigInt.prototype.toString);
	const symbolToString = typeof Symbol === "undefined" ? null : unapply(Symbol.prototype.toString);
	const objectHasOwnProperty = unapply(Object.prototype.hasOwnProperty);
	const objectToString = unapply(Object.prototype.toString);
	const regExpTest = unapply(RegExp.prototype.test);
	const typeErrorCreate = unconstruct(TypeError);
	/**
	* Creates a new function that calls the given function with a specified thisArg and arguments.
	*
	* @param func - The function to be wrapped and called.
	* @returns A new function that calls the given function with a specified thisArg and arguments.
	*/
	function unapply(func) {
		return function(thisArg) {
			if (thisArg instanceof RegExp) thisArg.lastIndex = 0;
			for (var _len3 = arguments.length, args = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) args[_key3 - 1] = arguments[_key3];
			return apply(func, thisArg, args);
		};
	}
	/**
	* Creates a new function that constructs an instance of the given constructor function with the provided arguments.
	*
	* @param func - The constructor function to be wrapped and called.
	* @returns A new function that constructs an instance of the given constructor function with the provided arguments.
	*/
	function unconstruct(Func) {
		return function() {
			for (var _len4 = arguments.length, args = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) args[_key4] = arguments[_key4];
			return construct(Func, args);
		};
	}
	/**
	* Add properties to a lookup table
	*
	* @param set - The set to which elements will be added.
	* @param array - The array containing elements to be added to the set.
	* @param transformCaseFunc - An optional function to transform the case of each element before adding to the set.
	* @returns The modified set with added elements.
	*/
	function addToSet(set, array) {
		let transformCaseFunc = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : stringToLowerCase;
		if (setPrototypeOf) setPrototypeOf(set, null);
		if (!arrayIsArray(array)) return set;
		let l = array.length;
		while (l--) {
			let element = array[l];
			if (typeof element === "string") {
				const lcElement = transformCaseFunc(element);
				if (lcElement !== element) {
					if (!isFrozen(array)) array[l] = lcElement;
					element = lcElement;
				}
			}
			set[element] = true;
		}
		return set;
	}
	/**
	* Clean up an array to harden against CSPP
	*
	* @param array - The array to be cleaned.
	* @returns The cleaned version of the array
	*/
	function cleanArray(array) {
		for (let index = 0; index < array.length; index++) if (!objectHasOwnProperty(array, index)) array[index] = null;
		return array;
	}
	/**
	* Shallow clone an object
	*
	* @param object - The object to be cloned.
	* @returns A new object that copies the original.
	*/
	function clone(object) {
		const newObject = create(null);
		for (const _ref2 of entries(object)) {
			var _ref3 = _slicedToArray(_ref2, 2);
			const property = _ref3[0];
			const value = _ref3[1];
			if (objectHasOwnProperty(object, property)) {
				if (arrayIsArray(value)) newObject[property] = cleanArray(value);
				else if (value && typeof value === "object" && value.constructor === Object) newObject[property] = clone(value);
				else newObject[property] = value;
			}
		}
		return newObject;
	}
	/**
	* Convert non-node values into strings without depending on direct property access.
	*
	* @param value - The value to stringify.
	* @returns A string representation of the provided value.
	*/
	function stringifyValue(value) {
		switch (typeof value) {
			case "string": return value;
			case "number": return numberToString(value);
			case "boolean": return booleanToString(value);
			case "bigint": return bigintToString ? bigintToString(value) : "0";
			case "symbol": return symbolToString ? symbolToString(value) : "Symbol()";
			case "undefined": return objectToString(value);
			case "function":
			case "object": {
				if (value === null) return objectToString(value);
				const valueAsRecord = value;
				const valueToString = lookupGetter(valueAsRecord, "toString");
				if (typeof valueToString === "function") {
					const stringified = valueToString(valueAsRecord);
					return typeof stringified === "string" ? stringified : objectToString(stringified);
				}
				return objectToString(value);
			}
			default: return objectToString(value);
		}
	}
	/**
	* This method automatically checks if the prop is function or getter and behaves accordingly.
	*
	* @param object - The object to look up the getter function in its prototype chain.
	* @param prop - The property name for which to find the getter function.
	* @returns The getter function found in the prototype chain or a fallback function.
	*/
	function lookupGetter(object, prop) {
		while (object !== null) {
			const desc = getOwnPropertyDescriptor(object, prop);
			if (desc) {
				if (desc.get) return unapply(desc.get);
				if (typeof desc.value === "function") return unapply(desc.value);
			}
			object = getPrototypeOf(object);
		}
		function fallbackValue() {
			return null;
		}
		return fallbackValue;
	}
	/**
	* Like lookupGetter, but for accessor properties only, and returns null
	* instead of a null-returning fallback when no getter exists on the chain.
	* Lets a caller fall back to a direct property read in environments that
	* lack the getter, where a fallback returning null would be indistinguishable
	* from a legitimate null value (e.g. namespaceURI of a no-namespace element).
	*
	* @param object - The object (usually a prototype) to start the lookup at.
	* @param prop - The accessor property name.
	* @returns The unapplied getter, or null if none was found.
	*/
	function lookupAccessor(object, prop) {
		while (object !== null) {
			const desc = getOwnPropertyDescriptor(object, prop);
			if (desc) return desc.get ? unapply(desc.get) : null;
			object = getPrototypeOf(object);
		}
		return null;
	}
	function isRegex(value) {
		try {
			regExpTest(value, "");
			return true;
		} catch (_unused) {
			return false;
		}
	}
	const html$1 = freeze([
		"a",
		"abbr",
		"acronym",
		"address",
		"area",
		"article",
		"aside",
		"audio",
		"b",
		"bdi",
		"bdo",
		"big",
		"blink",
		"blockquote",
		"body",
		"br",
		"button",
		"canvas",
		"caption",
		"center",
		"cite",
		"code",
		"col",
		"colgroup",
		"content",
		"data",
		"datalist",
		"dd",
		"decorator",
		"del",
		"details",
		"dfn",
		"dialog",
		"dir",
		"div",
		"dl",
		"dt",
		"element",
		"em",
		"fieldset",
		"figcaption",
		"figure",
		"font",
		"footer",
		"form",
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"head",
		"header",
		"hgroup",
		"hr",
		"html",
		"i",
		"img",
		"input",
		"ins",
		"kbd",
		"label",
		"legend",
		"li",
		"main",
		"map",
		"mark",
		"marquee",
		"menu",
		"menuitem",
		"meter",
		"nav",
		"nobr",
		"ol",
		"optgroup",
		"option",
		"output",
		"p",
		"picture",
		"pre",
		"progress",
		"q",
		"rp",
		"rt",
		"ruby",
		"s",
		"samp",
		"search",
		"section",
		"select",
		"shadow",
		"slot",
		"small",
		"source",
		"spacer",
		"span",
		"strike",
		"strong",
		"style",
		"sub",
		"summary",
		"sup",
		"table",
		"tbody",
		"td",
		"template",
		"textarea",
		"tfoot",
		"th",
		"thead",
		"time",
		"tr",
		"track",
		"tt",
		"u",
		"ul",
		"var",
		"video",
		"wbr"
	]);
	const svg$1 = freeze([
		"svg",
		"a",
		"altglyph",
		"altglyphdef",
		"altglyphitem",
		"animatecolor",
		"animatemotion",
		"animatetransform",
		"circle",
		"clippath",
		"defs",
		"desc",
		"ellipse",
		"enterkeyhint",
		"exportparts",
		"filter",
		"font",
		"g",
		"glyph",
		"glyphref",
		"hkern",
		"image",
		"inputmode",
		"line",
		"lineargradient",
		"marker",
		"mask",
		"metadata",
		"mpath",
		"part",
		"path",
		"pattern",
		"polygon",
		"polyline",
		"radialgradient",
		"rect",
		"stop",
		"style",
		"switch",
		"symbol",
		"text",
		"textpath",
		"title",
		"tref",
		"tspan",
		"view",
		"vkern"
	]);
	const svgFilters = freeze([
		"feBlend",
		"feColorMatrix",
		"feComponentTransfer",
		"feComposite",
		"feConvolveMatrix",
		"feDiffuseLighting",
		"feDisplacementMap",
		"feDistantLight",
		"feDropShadow",
		"feFlood",
		"feFuncA",
		"feFuncB",
		"feFuncG",
		"feFuncR",
		"feGaussianBlur",
		"feImage",
		"feMerge",
		"feMergeNode",
		"feMorphology",
		"feOffset",
		"fePointLight",
		"feSpecularLighting",
		"feSpotLight",
		"feTile",
		"feTurbulence"
	]);
	const svgDisallowed = freeze([
		"animate",
		"color-profile",
		"cursor",
		"discard",
		"font-face",
		"font-face-format",
		"font-face-name",
		"font-face-src",
		"font-face-uri",
		"foreignobject",
		"hatch",
		"hatchpath",
		"mesh",
		"meshgradient",
		"meshpatch",
		"meshrow",
		"missing-glyph",
		"script",
		"set",
		"solidcolor",
		"unknown",
		"use"
	]);
	const mathMl$1 = freeze([
		"math",
		"menclose",
		"merror",
		"mfenced",
		"mfrac",
		"mglyph",
		"mi",
		"mlabeledtr",
		"mmultiscripts",
		"mn",
		"mo",
		"mover",
		"mpadded",
		"mphantom",
		"mroot",
		"mrow",
		"ms",
		"mspace",
		"msqrt",
		"mstyle",
		"msub",
		"msup",
		"msubsup",
		"mtable",
		"mtd",
		"mtext",
		"mtr",
		"munder",
		"munderover",
		"mprescripts"
	]);
	const mathMlDisallowed = freeze([
		"maction",
		"maligngroup",
		"malignmark",
		"mlongdiv",
		"mscarries",
		"mscarry",
		"msgroup",
		"mstack",
		"msline",
		"msrow",
		"semantics",
		"annotation",
		"annotation-xml",
		"mprescripts",
		"none"
	]);
	const text = freeze(["#text"]);
	const html = freeze([
		"accept",
		"action",
		"align",
		"alt",
		"autocapitalize",
		"autocomplete",
		"autopictureinpicture",
		"autoplay",
		"background",
		"bgcolor",
		"border",
		"capture",
		"cellpadding",
		"cellspacing",
		"checked",
		"cite",
		"class",
		"clear",
		"color",
		"cols",
		"colspan",
		"command",
		"commandfor",
		"controls",
		"controlslist",
		"coords",
		"crossorigin",
		"datetime",
		"decoding",
		"default",
		"dir",
		"disabled",
		"disablepictureinpicture",
		"disableremoteplayback",
		"download",
		"draggable",
		"enctype",
		"enterkeyhint",
		"exportparts",
		"face",
		"for",
		"headers",
		"height",
		"hidden",
		"high",
		"href",
		"hreflang",
		"id",
		"inert",
		"inputmode",
		"integrity",
		"ismap",
		"kind",
		"label",
		"lang",
		"list",
		"loading",
		"loop",
		"low",
		"max",
		"maxlength",
		"media",
		"method",
		"min",
		"minlength",
		"multiple",
		"muted",
		"name",
		"nonce",
		"noshade",
		"novalidate",
		"nowrap",
		"open",
		"optimum",
		"part",
		"pattern",
		"placeholder",
		"playsinline",
		"popover",
		"popovertarget",
		"popovertargetaction",
		"poster",
		"preload",
		"pubdate",
		"radiogroup",
		"readonly",
		"rel",
		"required",
		"rev",
		"reversed",
		"role",
		"rows",
		"rowspan",
		"spellcheck",
		"scope",
		"selected",
		"shape",
		"size",
		"sizes",
		"slot",
		"span",
		"srclang",
		"start",
		"src",
		"srcset",
		"step",
		"style",
		"summary",
		"tabindex",
		"title",
		"translate",
		"type",
		"usemap",
		"valign",
		"value",
		"width",
		"wrap",
		"xmlns"
	]);
	const svg = freeze([
		"accent-height",
		"accumulate",
		"additive",
		"alignment-baseline",
		"amplitude",
		"ascent",
		"attributename",
		"attributetype",
		"azimuth",
		"basefrequency",
		"baseline-shift",
		"begin",
		"bias",
		"by",
		"class",
		"clip",
		"clippathunits",
		"clip-path",
		"clip-rule",
		"color",
		"color-interpolation",
		"color-interpolation-filters",
		"color-profile",
		"color-rendering",
		"cx",
		"cy",
		"d",
		"dx",
		"dy",
		"diffuseconstant",
		"direction",
		"display",
		"divisor",
		"dominant-baseline",
		"dur",
		"edgemode",
		"elevation",
		"end",
		"exponent",
		"fill",
		"fill-opacity",
		"fill-rule",
		"filter",
		"filterunits",
		"flood-color",
		"flood-opacity",
		"font-family",
		"font-size",
		"font-size-adjust",
		"font-stretch",
		"font-style",
		"font-variant",
		"font-weight",
		"fx",
		"fy",
		"g1",
		"g2",
		"glyph-name",
		"glyphref",
		"gradientunits",
		"gradienttransform",
		"height",
		"href",
		"id",
		"image-rendering",
		"in",
		"in2",
		"intercept",
		"k",
		"k1",
		"k2",
		"k3",
		"k4",
		"kerning",
		"keypoints",
		"keysplines",
		"keytimes",
		"lang",
		"lengthadjust",
		"letter-spacing",
		"kernelmatrix",
		"kernelunitlength",
		"lighting-color",
		"local",
		"marker-end",
		"marker-mid",
		"marker-start",
		"markerheight",
		"markerunits",
		"markerwidth",
		"maskcontentunits",
		"maskunits",
		"max",
		"mask",
		"mask-type",
		"media",
		"method",
		"mode",
		"min",
		"name",
		"numoctaves",
		"offset",
		"operator",
		"opacity",
		"order",
		"orient",
		"orientation",
		"origin",
		"overflow",
		"paint-order",
		"path",
		"pathlength",
		"patterncontentunits",
		"patterntransform",
		"patternunits",
		"pointer-events",
		"points",
		"preservealpha",
		"preserveaspectratio",
		"primitiveunits",
		"r",
		"rx",
		"ry",
		"radius",
		"refx",
		"refy",
		"repeatcount",
		"repeatdur",
		"restart",
		"result",
		"rotate",
		"scale",
		"seed",
		"shape-rendering",
		"slope",
		"specularconstant",
		"specularexponent",
		"spreadmethod",
		"startoffset",
		"stddeviation",
		"stitchtiles",
		"stop-color",
		"stop-opacity",
		"stroke-dasharray",
		"stroke-dashoffset",
		"stroke-linecap",
		"stroke-linejoin",
		"stroke-miterlimit",
		"stroke-opacity",
		"stroke",
		"stroke-width",
		"style",
		"surfacescale",
		"systemlanguage",
		"tabindex",
		"tablevalues",
		"targetx",
		"targety",
		"transform",
		"transform-origin",
		"text-anchor",
		"text-decoration",
		"text-orientation",
		"text-rendering",
		"textlength",
		"type",
		"u1",
		"u2",
		"unicode",
		"values",
		"vector-effect",
		"viewbox",
		"visibility",
		"version",
		"vert-adv-y",
		"vert-origin-x",
		"vert-origin-y",
		"width",
		"word-spacing",
		"wrap",
		"writing-mode",
		"xchannelselector",
		"ychannelselector",
		"x",
		"x1",
		"x2",
		"xmlns",
		"y",
		"y1",
		"y2",
		"z",
		"zoomandpan"
	]);
	const mathMl = freeze([
		"accent",
		"accentunder",
		"align",
		"bevelled",
		"close",
		"columnalign",
		"columnlines",
		"columnspacing",
		"columnspan",
		"denomalign",
		"depth",
		"dir",
		"display",
		"displaystyle",
		"encoding",
		"fence",
		"frame",
		"height",
		"href",
		"id",
		"largeop",
		"length",
		"linethickness",
		"lquote",
		"lspace",
		"mathbackground",
		"mathcolor",
		"mathsize",
		"mathvariant",
		"maxsize",
		"minsize",
		"movablelimits",
		"notation",
		"numalign",
		"open",
		"rowalign",
		"rowlines",
		"rowspacing",
		"rowspan",
		"rspace",
		"rquote",
		"scriptlevel",
		"scriptminsize",
		"scriptsizemultiplier",
		"selection",
		"separator",
		"separators",
		"stretchy",
		"subscriptshift",
		"supscriptshift",
		"symmetric",
		"voffset",
		"width",
		"xmlns"
	]);
	const xml = freeze([
		"xlink:href",
		"xml:id",
		"xlink:title",
		"xml:space",
		"xmlns:xlink"
	]);
	const MUSTACHE_EXPR = seal(/{{[\w\W]*|^[\w\W]*}}/g);
	const ERB_EXPR = seal(/<%[\w\W]*|^[\w\W]*%>/g);
	const TMPLIT_EXPR = seal(/\${[\w\W]*/g);
	const DATA_ATTR = seal(/^data-[\-\w.\u00B7-\uFFFF]+$/);
	const ARIA_ATTR = seal(/^aria-[\-\w]+$/);
	const IS_ALLOWED_URI = seal(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i);
	const IS_SCRIPT_OR_DATA = seal(/^(?:\w+script|data):/i);
	const ATTR_WHITESPACE = seal(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g);
	const DOCTYPE_NAME = seal(/^html$/i);
	const CUSTOM_ELEMENT = seal(/^[a-z][.\w]*(-[.\w]+)+$/i);
	const ELEMENT_MARKUP_PROBE = seal(/<[/\w!]/g);
	const COMMENT_MARKUP_PROBE = seal(/<[/\w]/g);
	const FALLBACK_TAG_CLOSE = seal(/<\/no(script|embed|frames)/i);
	const SELF_CLOSING_TAG = seal(/\/>/i);
	const NODE_TYPE = {
		element: 1,
		attribute: 2,
		text: 3,
		cdataSection: 4,
		entityReference: 5,
		entityNode: 6,
		processingInstruction: 7,
		comment: 8,
		document: 9,
		documentType: 10,
		documentFragment: 11,
		notation: 12
	};
	const LITERAL_TEXT_ELEMENTS = freeze(addToSet({}, [
		"style",
		"script",
		"xmp",
		"iframe",
		"noembed",
		"noframes",
		"plaintext",
		"noscript"
	]));
	const getGlobal = function getGlobal() {
		return typeof window === "undefined" ? null : window;
	};
	/**
	* Creates a no-op policy for internal use only.
	* Don't export this function outside this module!
	* @param trustedTypes The policy factory.
	* @param purifyHostElement The Script element used to load DOMPurify (to determine policy name suffix).
	* @return The policy created (or null, if Trusted Types
	* are not supported or creating the policy failed).
	*/
	const _createTrustedTypesPolicy = function _createTrustedTypesPolicy(trustedTypes, purifyHostElement) {
		if (typeof trustedTypes !== "object" || typeof trustedTypes.createPolicy !== "function") return null;
		let suffix = null;
		const ATTR_NAME = "data-tt-policy-suffix";
		if (purifyHostElement && purifyHostElement.hasAttribute(ATTR_NAME)) suffix = purifyHostElement.getAttribute(ATTR_NAME);
		const policyName = "dompurify" + (suffix ? "#" + suffix : "");
		try {
			return trustedTypes.createPolicy(policyName, {
				createHTML(html) {
					return html;
				},
				createScriptURL(scriptUrl) {
					return scriptUrl;
				}
			});
		} catch (_) {
			console.warn("TrustedTypes policy " + policyName + " could not be created.");
			return null;
		}
	};
	const _createHooksMap = function _createHooksMap() {
		return {
			afterSanitizeAttributes: [],
			afterSanitizeElements: [],
			afterSanitizeShadowDOM: [],
			beforeSanitizeAttributes: [],
			beforeSanitizeElements: [],
			beforeSanitizeShadowDOM: [],
			uponSanitizeAttribute: [],
			uponSanitizeElement: [],
			uponSanitizeShadowNode: []
		};
	};
	/**
	* Resolve a set-valued configuration option: a fresh set built from
	* cfg[key] when it is an own array property (seeded with a clone of
	* options.base when given, case-normalized via options.transform),
	* the fallback set otherwise.
	*
	* @param cfg the cloned, prototype-free configuration object
	* @param key the configuration property to read
	* @param fallback the set to use when the option is absent or not an array
	* @param options transform and optional base set to merge into
	* @returns the resolved set
	*/
	const _resolveSetOption = function _resolveSetOption(cfg, key, fallback, options) {
		return objectHasOwnProperty(cfg, key) && arrayIsArray(cfg[key]) ? addToSet(options.base ? clone(options.base) : {}, cfg[key], options.transform) : fallback;
	};
	/**
	* Resolve an object-valued configuration option: a prototype-free clone
	* of cfg[key] when it is an own, truthy object property, else a fresh
	* fallback built by makeFallback (fresh on every parse, so a previous
	* parse can never leak state into the next one).
	*
	* @param cfg the cloned, prototype-free configuration object
	* @param key the configuration property to read
	* @param makeFallback builds the fallback value when the option is absent
	* @returns the resolved object
	*/
	const _resolveObjectOption = function _resolveObjectOption(cfg, key, makeFallback) {
		const value = objectHasOwnProperty(cfg, key) ? cfg[key] : void 0;
		return value && typeof value === "object" ? clone(value) : makeFallback();
	};
	function createDOMPurify() {
		let window = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : getGlobal();
		const DOMPurify = (root) => createDOMPurify(root);
		DOMPurify.version = "3.4.17";
		DOMPurify.removed = [];
		if (!window || !window.document || window.document.nodeType !== NODE_TYPE.document || !window.Element) {
			DOMPurify.isSupported = false;
			return DOMPurify;
		}
		let document = window.document;
		const originalDocument = document;
		const currentScript = originalDocument.currentScript;
		window.DocumentFragment;
		const HTMLTemplateElement = window.HTMLTemplateElement, Node = window.Node, Element = window.Element, NodeFilter = window.NodeFilter;
		window.NamedNodeMap === void 0 && (window.NamedNodeMap || window.MozNamedAttrMap);
		window.HTMLFormElement;
		const DOMParser = window.DOMParser, trustedTypes = window.trustedTypes;
		const ElementPrototype = Element.prototype;
		const cloneNode = lookupGetter(ElementPrototype, "cloneNode");
		const remove = lookupGetter(ElementPrototype, "remove");
		const removeAttributeNode = lookupGetter(ElementPrototype, "removeAttributeNode");
		const getNextSibling = lookupGetter(ElementPrototype, "nextSibling");
		const getChildNodes = lookupGetter(ElementPrototype, "childNodes");
		const getParentNode = lookupGetter(ElementPrototype, "parentNode");
		const getShadowRoot = lookupGetter(ElementPrototype, "shadowRoot");
		const getAttributes = lookupGetter(ElementPrototype, "attributes");
		const getNodeType = Node && Node.prototype ? lookupGetter(Node.prototype, "nodeType") : null;
		const getNodeName = Node && Node.prototype ? lookupGetter(Node.prototype, "nodeName") : null;
		const getOwnerDocument = Node && Node.prototype ? lookupGetter(Node.prototype, "ownerDocument") : null;
		const _readNodeType = function _readNodeType(node) {
			return getNodeType ? getNodeType(node) : node.nodeType;
		};
		const _readNodeName = function _readNodeName(node) {
			return getNodeName ? getNodeName(node) : node.nodeName;
		};
		const getNamespaceURI = lookupAccessor(ElementPrototype, "namespaceURI");
		const _readNamespaceURI = function _readNamespaceURI(element) {
			return getNamespaceURI ? getNamespaceURI(element) : element.namespaceURI;
		};
		if (typeof HTMLTemplateElement === "function") {
			const template = document.createElement("template");
			if (template.content && template.content.ownerDocument) document = template.content.ownerDocument;
		}
		let trustedTypesPolicy;
		let emptyHTML = "";
		let defaultTrustedTypesPolicy;
		let defaultTrustedTypesPolicyResolved = false;
		let IN_TRUSTED_TYPES_POLICY = 0;
		const _assertNotInTrustedTypesPolicy = function _assertNotInTrustedTypesPolicy() {
			if (IN_TRUSTED_TYPES_POLICY > 0) throw typeErrorCreate("A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the \"DOMPurify and Trusted Types\" section of the README.");
		};
		const _createTrustedHTML = function _createTrustedHTML(html) {
			_assertNotInTrustedTypesPolicy();
			IN_TRUSTED_TYPES_POLICY++;
			try {
				return trustedTypesPolicy.createHTML(html);
			} finally {
				IN_TRUSTED_TYPES_POLICY--;
			}
		};
		const _createTrustedScriptURL = function _createTrustedScriptURL(scriptUrl) {
			_assertNotInTrustedTypesPolicy();
			IN_TRUSTED_TYPES_POLICY++;
			try {
				return trustedTypesPolicy.createScriptURL(scriptUrl);
			} finally {
				IN_TRUSTED_TYPES_POLICY--;
			}
		};
		const _getDefaultTrustedTypesPolicy = function _getDefaultTrustedTypesPolicy() {
			if (!defaultTrustedTypesPolicyResolved) {
				defaultTrustedTypesPolicy = _createTrustedTypesPolicy(trustedTypes, currentScript);
				defaultTrustedTypesPolicyResolved = true;
			}
			return defaultTrustedTypesPolicy;
		};
		const _document = document, implementation = _document.implementation, createNodeIterator = _document.createNodeIterator, createDocumentFragment = _document.createDocumentFragment, getElementsByTagName = _document.getElementsByTagName;
		const importNode = originalDocument.importNode;
		let hooks = _createHooksMap();
		/**
		* Expose whether this browser supports running the full DOMPurify.
		*/
		DOMPurify.isSupported = typeof entries === "function" && typeof getParentNode === "function" && implementation && implementation.createHTMLDocument !== void 0;
		const MUSTACHE_EXPR$1 = MUSTACHE_EXPR, ERB_EXPR$1 = ERB_EXPR, TMPLIT_EXPR$1 = TMPLIT_EXPR, DATA_ATTR$1 = DATA_ATTR, ARIA_ATTR$1 = ARIA_ATTR, IS_SCRIPT_OR_DATA$1 = IS_SCRIPT_OR_DATA, ATTR_WHITESPACE$1 = ATTR_WHITESPACE, CUSTOM_ELEMENT$1 = CUSTOM_ELEMENT;
		let IS_ALLOWED_URI$1 = IS_ALLOWED_URI;
		/**
		* We consider the elements and attributes below to be safe. Ideally
		* don't add any new ones but feel free to remove unwanted ones.
		*/
		let ALLOWED_TAGS = null;
		const DEFAULT_ALLOWED_TAGS = addToSet({}, [
			...html$1,
			...svg$1,
			...svgFilters,
			...mathMl$1,
			...text
		]);
		let ALLOWED_ATTR = null;
		const DEFAULT_ALLOWED_ATTR = addToSet({}, [
			...html,
			...svg,
			...mathMl,
			...xml
		]);
		let CUSTOM_ELEMENT_HANDLING = Object.seal(create(null, {
			tagNameCheck: {
				writable: true,
				configurable: false,
				enumerable: true,
				value: null
			},
			attributeNameCheck: {
				writable: true,
				configurable: false,
				enumerable: true,
				value: null
			},
			allowCustomizedBuiltInElements: {
				writable: true,
				configurable: false,
				enumerable: true,
				value: false
			}
		}));
		let FORBID_TAGS = null;
		let FORBID_ATTR = null;
		const EXTRA_ELEMENT_HANDLING = Object.seal(create(null, {
			tagCheck: {
				writable: true,
				configurable: false,
				enumerable: true,
				value: null
			},
			attributeCheck: {
				writable: true,
				configurable: false,
				enumerable: true,
				value: null
			}
		}));
		let ALLOW_ARIA_ATTR = true;
		let ALLOW_DATA_ATTR = true;
		let ALLOW_UNKNOWN_PROTOCOLS = false;
		let ALLOW_SELF_CLOSE_IN_ATTR = true;
		let SAFE_FOR_TEMPLATES = false;
		let SAFE_FOR_XML = true;
		let WHOLE_DOCUMENT = false;
		let SET_CONFIG = false;
		let SET_CONFIG_ALLOWED_TAGS = null;
		let SET_CONFIG_ALLOWED_ATTR = null;
		let FORCE_BODY = false;
		let RETURN_DOM = false;
		let RETURN_DOM_FRAGMENT = false;
		let RETURN_TRUSTED_TYPE = false;
		let SANITIZE_DOM = true;
		let SANITIZE_NAMED_PROPS = false;
		const SANITIZE_NAMED_PROPS_PREFIX = "user-content-";
		let KEEP_CONTENT = true;
		let IN_PLACE = false;
		let IN_PLACE_VISITED = null;
		let USE_PROFILES = {};
		let FORBID_CONTENTS = null;
		const DEFAULT_FORBID_CONTENTS = addToSet({}, [
			"annotation-xml",
			"audio",
			"colgroup",
			"desc",
			"foreignobject",
			"head",
			"iframe",
			"math",
			"mi",
			"mn",
			"mo",
			"ms",
			"mtext",
			"noembed",
			"noframes",
			"noscript",
			"plaintext",
			"script",
			"selectedcontent",
			"style",
			"svg",
			"template",
			"thead",
			"title",
			"video",
			"xmp"
		]);
		let DATA_URI_TAGS = null;
		const DEFAULT_DATA_URI_TAGS = addToSet({}, [
			"audio",
			"video",
			"img",
			"source",
			"image",
			"track"
		]);
		let URI_SAFE_ATTRIBUTES = null;
		const DEFAULT_URI_SAFE_ATTRIBUTES = addToSet({}, [
			"alt",
			"class",
			"for",
			"id",
			"label",
			"name",
			"pattern",
			"placeholder",
			"role",
			"summary",
			"title",
			"value",
			"style",
			"xmlns"
		]);
		const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML";
		const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
		const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
		let NAMESPACE = HTML_NAMESPACE;
		let IS_EMPTY_INPUT = false;
		let ALLOWED_NAMESPACES = null;
		const DEFAULT_ALLOWED_NAMESPACES = addToSet({}, [
			MATHML_NAMESPACE,
			SVG_NAMESPACE,
			HTML_NAMESPACE
		], stringToString);
		const DEFAULT_MATHML_TEXT_INTEGRATION_POINTS = freeze([
			"mi",
			"mo",
			"mn",
			"ms",
			"mtext"
		]);
		let MATHML_TEXT_INTEGRATION_POINTS = addToSet({}, DEFAULT_MATHML_TEXT_INTEGRATION_POINTS);
		const DEFAULT_HTML_INTEGRATION_POINTS = freeze(["annotation-xml"]);
		let HTML_INTEGRATION_POINTS = addToSet({}, DEFAULT_HTML_INTEGRATION_POINTS);
		const COMMON_SVG_AND_HTML_ELEMENTS = addToSet({}, [
			"title",
			"style",
			"font",
			"a",
			"script"
		]);
		let PARSER_MEDIA_TYPE = null;
		const SUPPORTED_PARSER_MEDIA_TYPES = ["application/xhtml+xml", "text/html"];
		const DEFAULT_PARSER_MEDIA_TYPE = "text/html";
		let transformCaseFunc = null;
		let CONFIG = null;
		const formElement = document.createElement("form");
		const isRegexOrFunction = function isRegexOrFunction(testValue) {
			return testValue instanceof RegExp || testValue instanceof Function;
		};
		/**
		* _parseConfig
		*
		* @param cfg optional config literal
		*/
		const _parseConfig = function _parseConfig() {
			let cfg = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
			if (CONFIG && CONFIG === cfg) return;
			if (!cfg || typeof cfg !== "object") cfg = {};
			cfg = clone(cfg);
			PARSER_MEDIA_TYPE = SUPPORTED_PARSER_MEDIA_TYPES.indexOf(cfg.PARSER_MEDIA_TYPE) === -1 ? DEFAULT_PARSER_MEDIA_TYPE : cfg.PARSER_MEDIA_TYPE;
			transformCaseFunc = PARSER_MEDIA_TYPE === "application/xhtml+xml" ? stringToString : stringToLowerCase;
			ALLOWED_TAGS = _resolveSetOption(cfg, "ALLOWED_TAGS", DEFAULT_ALLOWED_TAGS, { transform: transformCaseFunc });
			ALLOWED_ATTR = _resolveSetOption(cfg, "ALLOWED_ATTR", DEFAULT_ALLOWED_ATTR, { transform: transformCaseFunc });
			ALLOWED_NAMESPACES = _resolveSetOption(cfg, "ALLOWED_NAMESPACES", DEFAULT_ALLOWED_NAMESPACES, { transform: stringToString });
			URI_SAFE_ATTRIBUTES = _resolveSetOption(cfg, "ADD_URI_SAFE_ATTR", DEFAULT_URI_SAFE_ATTRIBUTES, {
				transform: transformCaseFunc,
				base: DEFAULT_URI_SAFE_ATTRIBUTES
			});
			DATA_URI_TAGS = _resolveSetOption(cfg, "ADD_DATA_URI_TAGS", DEFAULT_DATA_URI_TAGS, {
				transform: transformCaseFunc,
				base: DEFAULT_DATA_URI_TAGS
			});
			FORBID_CONTENTS = _resolveSetOption(cfg, "FORBID_CONTENTS", DEFAULT_FORBID_CONTENTS, { transform: transformCaseFunc });
			FORBID_TAGS = _resolveSetOption(cfg, "FORBID_TAGS", clone({}), { transform: transformCaseFunc });
			FORBID_ATTR = _resolveSetOption(cfg, "FORBID_ATTR", clone({}), { transform: transformCaseFunc });
			USE_PROFILES = objectHasOwnProperty(cfg, "USE_PROFILES") ? cfg.USE_PROFILES && typeof cfg.USE_PROFILES === "object" ? clone(cfg.USE_PROFILES) : cfg.USE_PROFILES : false;
			ALLOW_ARIA_ATTR = cfg.ALLOW_ARIA_ATTR !== false;
			ALLOW_DATA_ATTR = cfg.ALLOW_DATA_ATTR !== false;
			ALLOW_UNKNOWN_PROTOCOLS = cfg.ALLOW_UNKNOWN_PROTOCOLS || false;
			ALLOW_SELF_CLOSE_IN_ATTR = cfg.ALLOW_SELF_CLOSE_IN_ATTR !== false;
			SAFE_FOR_TEMPLATES = cfg.SAFE_FOR_TEMPLATES || false;
			SAFE_FOR_XML = cfg.SAFE_FOR_XML !== false;
			WHOLE_DOCUMENT = cfg.WHOLE_DOCUMENT || false;
			RETURN_DOM = cfg.RETURN_DOM || false;
			RETURN_DOM_FRAGMENT = cfg.RETURN_DOM_FRAGMENT || false;
			RETURN_TRUSTED_TYPE = cfg.RETURN_TRUSTED_TYPE || false;
			FORCE_BODY = cfg.FORCE_BODY || false;
			SANITIZE_DOM = cfg.SANITIZE_DOM !== false;
			SANITIZE_NAMED_PROPS = cfg.SANITIZE_NAMED_PROPS || false;
			KEEP_CONTENT = cfg.KEEP_CONTENT !== false;
			IN_PLACE = cfg.IN_PLACE || false;
			IS_ALLOWED_URI$1 = isRegex(cfg.ALLOWED_URI_REGEXP) ? cfg.ALLOWED_URI_REGEXP : IS_ALLOWED_URI;
			NAMESPACE = typeof cfg.NAMESPACE === "string" ? cfg.NAMESPACE : HTML_NAMESPACE;
			MATHML_TEXT_INTEGRATION_POINTS = _resolveObjectOption(cfg, "MATHML_TEXT_INTEGRATION_POINTS", () => addToSet({}, DEFAULT_MATHML_TEXT_INTEGRATION_POINTS));
			HTML_INTEGRATION_POINTS = _resolveObjectOption(cfg, "HTML_INTEGRATION_POINTS", () => addToSet({}, DEFAULT_HTML_INTEGRATION_POINTS));
			const customElementHandling = _resolveObjectOption(cfg, "CUSTOM_ELEMENT_HANDLING", () => create(null));
			CUSTOM_ELEMENT_HANDLING = create(null);
			if (objectHasOwnProperty(customElementHandling, "tagNameCheck") && isRegexOrFunction(customElementHandling.tagNameCheck)) CUSTOM_ELEMENT_HANDLING.tagNameCheck = customElementHandling.tagNameCheck;
			if (objectHasOwnProperty(customElementHandling, "attributeNameCheck") && isRegexOrFunction(customElementHandling.attributeNameCheck)) CUSTOM_ELEMENT_HANDLING.attributeNameCheck = customElementHandling.attributeNameCheck;
			if (objectHasOwnProperty(customElementHandling, "allowCustomizedBuiltInElements") && typeof customElementHandling.allowCustomizedBuiltInElements === "boolean") CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements = customElementHandling.allowCustomizedBuiltInElements;
			seal(CUSTOM_ELEMENT_HANDLING);
			if (SAFE_FOR_TEMPLATES) ALLOW_DATA_ATTR = false;
			if (RETURN_DOM_FRAGMENT) RETURN_DOM = true;
			if (USE_PROFILES) {
				ALLOWED_TAGS = addToSet({}, text);
				ALLOWED_ATTR = create(null);
				if (USE_PROFILES.html === true) {
					addToSet(ALLOWED_TAGS, html$1);
					addToSet(ALLOWED_ATTR, html);
				}
				if (USE_PROFILES.svg === true) {
					addToSet(ALLOWED_TAGS, svg$1);
					addToSet(ALLOWED_ATTR, svg);
					addToSet(ALLOWED_ATTR, xml);
				}
				if (USE_PROFILES.svgFilters === true) {
					addToSet(ALLOWED_TAGS, svgFilters);
					addToSet(ALLOWED_ATTR, svg);
					addToSet(ALLOWED_ATTR, xml);
				}
				if (USE_PROFILES.mathMl === true) {
					addToSet(ALLOWED_TAGS, mathMl$1);
					addToSet(ALLOWED_ATTR, mathMl);
					addToSet(ALLOWED_ATTR, xml);
				}
			}
			EXTRA_ELEMENT_HANDLING.tagCheck = null;
			EXTRA_ELEMENT_HANDLING.attributeCheck = null;
			if (objectHasOwnProperty(cfg, "ADD_TAGS")) {
				if (typeof cfg.ADD_TAGS === "function") EXTRA_ELEMENT_HANDLING.tagCheck = cfg.ADD_TAGS;
				else if (arrayIsArray(cfg.ADD_TAGS)) {
					if (ALLOWED_TAGS === DEFAULT_ALLOWED_TAGS) ALLOWED_TAGS = clone(ALLOWED_TAGS);
					addToSet(ALLOWED_TAGS, cfg.ADD_TAGS, transformCaseFunc);
				}
			}
			if (objectHasOwnProperty(cfg, "ADD_ATTR")) {
				if (typeof cfg.ADD_ATTR === "function") EXTRA_ELEMENT_HANDLING.attributeCheck = cfg.ADD_ATTR;
				else if (arrayIsArray(cfg.ADD_ATTR)) {
					if (ALLOWED_ATTR === DEFAULT_ALLOWED_ATTR) ALLOWED_ATTR = clone(ALLOWED_ATTR);
					addToSet(ALLOWED_ATTR, cfg.ADD_ATTR, transformCaseFunc);
				}
			}
			if (objectHasOwnProperty(cfg, "ADD_FORBID_CONTENTS") && arrayIsArray(cfg.ADD_FORBID_CONTENTS)) {
				if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) FORBID_CONTENTS = clone(FORBID_CONTENTS);
				addToSet(FORBID_CONTENTS, cfg.ADD_FORBID_CONTENTS, transformCaseFunc);
			}
			if (KEEP_CONTENT) ALLOWED_TAGS["#text"] = true;
			if (WHOLE_DOCUMENT) addToSet(ALLOWED_TAGS, [
				"html",
				"head",
				"body"
			]);
			if (ALLOWED_TAGS.table) {
				addToSet(ALLOWED_TAGS, ["tbody"]);
				delete FORBID_TAGS.tbody;
			}
			if (cfg.TRUSTED_TYPES_POLICY) {
				if (typeof cfg.TRUSTED_TYPES_POLICY.createHTML !== "function") throw typeErrorCreate("TRUSTED_TYPES_POLICY configuration option must provide a \"createHTML\" hook.");
				if (typeof cfg.TRUSTED_TYPES_POLICY.createScriptURL !== "function") throw typeErrorCreate("TRUSTED_TYPES_POLICY configuration option must provide a \"createScriptURL\" hook.");
				const previousTrustedTypesPolicy = trustedTypesPolicy;
				trustedTypesPolicy = cfg.TRUSTED_TYPES_POLICY;
				try {
					emptyHTML = _createTrustedHTML("");
				} catch (error) {
					trustedTypesPolicy = previousTrustedTypesPolicy;
					throw error;
				}
			} else if (cfg.TRUSTED_TYPES_POLICY === null) {
				trustedTypesPolicy = void 0;
				emptyHTML = "";
			} else {
				if (trustedTypesPolicy === void 0) trustedTypesPolicy = _getDefaultTrustedTypesPolicy();
				if (trustedTypesPolicy && typeof emptyHTML === "string") emptyHTML = _createTrustedHTML("");
			}
			if (freeze) freeze(cfg);
			CONFIG = cfg;
		};
		const ALL_SVG_TAGS = addToSet({}, [
			...svg$1,
			...svgFilters,
			...svgDisallowed
		]);
		const ALL_MATHML_TAGS = addToSet({}, [...mathMl$1, ...mathMlDisallowed]);
		/**
		* Namespace rules for an element in the SVG namespace.
		*
		* @param tagName the element's lowercase tag name
		* @param parent the (possibly simulated) parent node
		* @param parentTagName the parent's lowercase tag name
		* @returns true if a spec-compliant parser could produce this element
		*/
		const _checkSvgNamespace = function _checkSvgNamespace(tagName, parent, parentTagName) {
			if (parent.namespaceURI === HTML_NAMESPACE) return tagName === "svg";
			if (parent.namespaceURI === MATHML_NAMESPACE) return tagName === "svg" && (parentTagName === "annotation-xml" || MATHML_TEXT_INTEGRATION_POINTS[parentTagName]);
			return Boolean(ALL_SVG_TAGS[tagName]);
		};
		/**
		* Namespace rules for an element in the MathML namespace.
		*
		* @param tagName the element's lowercase tag name
		* @param parent the (possibly simulated) parent node
		* @param parentTagName the parent's lowercase tag name
		* @returns true if a spec-compliant parser could produce this element
		*/
		const _checkMathMlNamespace = function _checkMathMlNamespace(tagName, parent, parentTagName) {
			if (parent.namespaceURI === HTML_NAMESPACE) return tagName === "math";
			if (parent.namespaceURI === SVG_NAMESPACE) return tagName === "math" && HTML_INTEGRATION_POINTS[parentTagName];
			return Boolean(ALL_MATHML_TAGS[tagName]);
		};
		/**
		* Namespace rules for an element in the HTML namespace.
		*
		* @param tagName the element's lowercase tag name
		* @param parent the (possibly simulated) parent node
		* @param parentTagName the parent's lowercase tag name
		* @returns true if a spec-compliant parser could produce this element
		*/
		const _checkHtmlNamespace = function _checkHtmlNamespace(tagName, parent, parentTagName) {
			if (parent.namespaceURI === SVG_NAMESPACE && !HTML_INTEGRATION_POINTS[parentTagName]) return false;
			if (parent.namespaceURI === MATHML_NAMESPACE && !MATHML_TEXT_INTEGRATION_POINTS[parentTagName]) return false;
			return !ALL_MATHML_TAGS[tagName] && (COMMON_SVG_AND_HTML_ELEMENTS[tagName] || !ALL_SVG_TAGS[tagName]);
		};
		/**
		* @param element a DOM element whose namespace is being checked
		* @returns Return false if the element has a
		*  namespace that a spec-compliant parser would never
		*  return. Return true otherwise.
		*/
		const _checkValidNamespace = function _checkValidNamespace(element) {
			const elementNamespace = _readNamespaceURI(element);
			const tagName = stringToLowerCase(_readNodeName(element));
			const parentNode = getParentNode(element);
			let parent;
			let parentTagName;
			if (parentNode && _readNodeType(parentNode) === NODE_TYPE.element) {
				parent = { namespaceURI: _readNamespaceURI(parentNode) };
				parentTagName = stringToLowerCase(_readNodeName(parentNode));
			} else {
				parent = { namespaceURI: NAMESPACE };
				parentTagName = "template";
			}
			if (!ALLOWED_NAMESPACES[elementNamespace]) return false;
			if (elementNamespace === SVG_NAMESPACE) return _checkSvgNamespace(tagName, parent, parentTagName);
			if (elementNamespace === MATHML_NAMESPACE) return _checkMathMlNamespace(tagName, parent, parentTagName);
			if (elementNamespace === HTML_NAMESPACE) return _checkHtmlNamespace(tagName, parent, parentTagName);
			if (PARSER_MEDIA_TYPE === "application/xhtml+xml" && ALLOWED_NAMESPACES[elementNamespace]) return true;
			return false;
		};
		/**
		* _forceRemove
		*
		* @param node a DOM node
		*/
		const _forceRemove = function _forceRemove(node) {
			arrayPush(DOMPurify.removed, { element: node });
			try {
				getParentNode(node).removeChild(node);
			} catch (_) {
				remove(node);
				if (!getParentNode(node)) throw typeErrorCreate("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place");
			}
		};
		/**
		* _stripAttributeNode
		*
		* Remove a single Attr node case/namespace-exactly on an attribute-teardown
		* path. Name-based removeAttribute() ASCII-lowercases its lookup key for an
		* HTML element in an HTML document and so silently misses a case-preserved
		* handler (e.g. `ONERROR` off an XML/XHTML import) - the same defect
		* _removeAttribute() was fixed for, which a name-based call would reintroduce
		* on these IN_PLACE teardown paths. Unlike _removeAttribute this does not
		* record into DOMPurify.removed: the neutralize passes intentionally do not
		* book-keep. A clobbered/detached node falls back to best-effort name-based
		* removal.
		*
		* @param element the element to strip the attribute from
		* @param attribute the Attr node to remove
		* @param name the attribute's name, for the fallback path
		*/
		const _stripAttributeNode = function _stripAttributeNode(element, attribute, name) {
			try {
				removeAttributeNode(element, attribute);
			} catch (_) {
				try {
					element.removeAttribute(name);
				} catch (_) {}
			}
		};
		/**
		* Fail-closed teardown of an in-place root: strip every disallowed attribute
		* in the subtree first, so nothing armed is left behind, then remove all
		* children and the root's own attributes.
		*
		* @param root the in-place root to empty
		*/
		const _neutralizeRoot = function _neutralizeRoot(root) {
			_neutralizeSubtree(root);
			const childNodes = getChildNodes(root);
			if (childNodes) arrayForEach(arraySlice(childNodes), (child) => {
				try {
					remove(child);
				} catch (_) {}
			});
			const attributes = _readNodeType(root) === NODE_TYPE.element ? getAttributes(root) : null;
			if (attributes) for (let i = attributes.length - 1; i >= 0; --i) {
				const attribute = attributes[i];
				const name = attribute && attribute.name;
				if (typeof name === "string") _stripAttributeNode(root, attribute, name);
			}
		};
		/**
		* Removes an attribute, preferably as its exact Attr node: name-based
		* removal lowercases the name in HTML documents and misses case-preserved
		* names, e.g. from imported XHTML.
		*
		* @param name an Attribute name
		* @param element a DOM node
		* @param attr the exact Attr node to remove, when the caller has it
		*/
		const _removeAttribute = function _removeAttribute(name, element, attr) {
			if (!attr) try {
				attr = element.getAttributeNode(name);
			} catch (_) {
				attr = null;
			}
			arrayPush(DOMPurify.removed, {
				attribute: attr || null,
				from: element
			});
			try {
				if (attr) removeAttributeNode(element, attr);
				else element.removeAttribute(name);
			} catch (_) {
				try {
					element.removeAttribute(name);
				} catch (_) {}
			}
			if (name === "is") {
				if (RETURN_DOM || RETURN_DOM_FRAGMENT) try {
					_forceRemove(element);
				} catch (_) {}
				else try {
					element.setAttribute(name, "");
				} catch (_) {}
			}
		};
		/**
		* Removes every attribute the configuration does not allow. Used to
		* neutralize nodes discarded from an in-place tree.
		*
		* @param element the element to strip
		*/
		const _stripDisallowedAttributes = function _stripDisallowedAttributes(element) {
			const attributes = getAttributes(element);
			if (!attributes) return;
			for (let i = attributes.length - 1; i >= 0; --i) {
				const attribute = attributes[i];
				const name = attribute && attribute.name;
				if (typeof name !== "string" || ALLOWED_ATTR[transformCaseFunc(name)]) continue;
				_stripAttributeNode(element, attribute, name);
			}
		};
		/**
		* Iterative depth-first walk, so deep trees cannot overflow the call stack,
		* reading through the cached getters, so clobbering cannot hide children.
		* When `visit` returns false, the node's children are skipped. With
		* `intoShadow`, open shadow roots are walked after their host's children.
		*
		* @param root where to start
		* @param visit called for every node
		* @param intoShadow whether to enter open shadow roots
		*/
		const _walkTree = function _walkTree(root, visit) {
			let intoShadow = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : false;
			const stack = [root];
			while (stack.length > 0) {
				const node = stack.pop();
				if (visit(node) === false) continue;
				if (intoShadow && _readNodeType(node) === NODE_TYPE.element) {
					const shadowRoot = getShadowRoot(node);
					if (_isDocumentFragment(shadowRoot)) stack.push(shadowRoot);
				}
				const childNodes = getChildNodes(node);
				if (childNodes) for (let i = childNodes.length - 1; i >= 0; --i) stack.push(childNodes[i]);
			}
		};
		/**
		* Strips disallowed attributes from every element of a discarded subtree,
		* so a handler that is already queued (a loading image) cannot fire.
		*
		* @param root the root of a removed subtree
		*/
		const _neutralizeSubtree = function _neutralizeSubtree(root) {
			_walkTree(root, (node) => {
				if (_readNodeType(node) === NODE_TYPE.element) _stripDisallowedAttributes(node);
			});
		};
		/**
		* All nodes under `root`, root first, including open shadow roots. Template
		* content is not entered, it is inert.
		*
		* @param root the in-place root
		* @return the nodes
		*/
		const _collectLiveNodes = function _collectLiveNodes(root) {
			const nodes = [];
			_walkTree(root, (node) => {
				nodes.push(node);
			}, true);
			return nodes;
		};
		/**
		* Strips disallowed attributes from every element that was under the
		* in-place root when the call started and no longer is, whatever removed
		* or moved it.
		*
		* @param root the in-place root
		* @param before the root's nodes, collected before the walk
		*/
		const _neutralizeEscapedElements = function _neutralizeEscapedElements(root, before) {
			const reachable = setCreate();
			arrayForEach(_collectLiveNodes(root), (node) => {
				if (_readNodeType(node) === NODE_TYPE.element) setAdd(reachable, node);
			});
			arrayForEach(before, (node) => {
				if (_readNodeType(node) === NODE_TYPE.element && !setHas(reachable, node)) _stripDisallowedAttributes(node);
			});
		};
		/**
		* Neutralizes everything that left the in-place tree during the call: what
		* DOMPurify removed, and what hooks or custom elements removed or moved out.
		*
		* @param root the in-place root
		* @param before the root's nodes, collected before the walk
		* @return true if the root itself was removed
		*/
		const _neutralizeDiscarded = function _neutralizeDiscarded(root, before) {
			let rootRemoved = false;
			arrayForEach(DOMPurify.removed, (entry) => {
				if (entry.element) {
					rootRemoved = rootRemoved || entry.element === root;
					_neutralizeSubtree(entry.element);
				}
			});
			_neutralizeEscapedElements(root, before);
			return rootRemoved;
		};
		const MAX_UNVISITED_ROUNDS = 8;
		/**
		* The walk only moves forward, so a node moved to a position it already
		* passed is never visited. Give every original node that is still in the
		* tree but unvisited the normal treatment, hooks included. Nodes created
		* during the call are left alone. Fails closed if the tree keeps changing.
		*
		* @param root the in-place root
		* @param before the root's nodes, collected before the walk
		*/
		const _sanitizeUnvisitedNodes = function _sanitizeUnvisitedNodes(root, before) {
			const visited = IN_PLACE_VISITED;
			let original = null;
			const getOriginal = () => {
				if (!original) {
					original = setCreate();
					arrayForEach(before, (beforeNode) => {
						setAdd(original, beforeNode);
					});
				}
				return original;
			};
			for (let round = 0;; round++) {
				const live = _collectLiveNodes(root);
				const containers = [root];
				let pending = false;
				arrayForEach(live, (node) => {
					if (_readNodeType(node) === NODE_TYPE.documentFragment) arrayPush(containers, node);
					else if (!pending && !setHas(visited, node)) pending = setHas(getOriginal(), node);
				});
				if (!pending) return;
				if (round >= MAX_UNVISITED_ROUNDS) throw typeErrorCreate("the tree kept changing during in-place sanitization; refusing to return it");
				arrayForEach(containers, (container, index) => {
					_sanitizeUnvisitedIn(container, index > 0, root, getOriginal());
				});
			}
		};
		/**
		* One _sanitizeUnvisitedNodes pass over the root or an open shadow root.
		*
		* @param container the root or an open shadow root
		* @param inShadow whether container is a shadow root
		* @param root the in-place root
		* @param original the root's nodes collected before the walk, as a set
		*/
		const _sanitizeUnvisitedIn = function _sanitizeUnvisitedIn(container, inShadow, root, original) {
			const iterator = _createNodeIterator(container);
			let node;
			while (node = iterator.nextNode()) {
				if (!setHas(original, node) || setHas(IN_PLACE_VISITED, node)) continue;
				if (inShadow) _executeHooks(hooks.uponSanitizeShadowNode, node, null);
				_sanitizeElements(node, root);
				_sanitizeAttributes(node, root);
				if (_isDocumentFragment(node.content)) _sanitizeShadowDOM2(node.content);
			}
		};
		/**
		* Records that _sanitizeElements processed `node`. No-op outside IN_PLACE.
		*
		* @param node the node being processed
		*/
		const _markVisited = function _markVisited(node) {
			if (IN_PLACE_VISITED) setAdd(IN_PLACE_VISITED, node);
		};
		/**
		* Patch-linkage attributes (declarative partial updates): `patchsrc`
		* always, `for` everywhere except on <label> and <output>. Gated on
		* SAFE_FOR_XML. Shared by the IN_PLACE pre-pass and _isValidAttribute.
		*
		* @param lcName the transformCaseFunc'd attribute name
		* @param lcTag the transformCaseFunc'd tag name of the carrying element
		* @return true if the attribute is patch linkage and must be dropped
		*/
		const _isPatchLinkageAttribute = function _isPatchLinkageAttribute(lcName, lcTag) {
			if (!SAFE_FOR_XML) return false;
			if (lcName === "patchsrc") return true;
			return lcName === "for" && lcTag !== "label" && lcTag !== "output";
		};
		/**
		* IN_PLACE pre-pass: sever all patch linkage before the walk, so no patch
		* can fire mid-walk into a part of the tree the walker already passed.
		* Removes range markers (processing instructions, comments with markup)
		* and strips linkage attributes. It cannot undo a patch that already fired.
		*
		* TODO: if the shipped feature can patch through `for` on <label>/<output>,
		* drop that pair here too (see test/declarative-patch-probe.html).
		*
		* @param root the in-place root to sweep
		*/
		const _neutralizePatchLinkage = function _neutralizePatchLinkage(root) {
			if (!SAFE_FOR_XML) return;
			_walkTree(root, (node) => {
				const nodeType = _readNodeType(node);
				if (nodeType === NODE_TYPE.processingInstruction || nodeType === NODE_TYPE.comment && regExpTest(COMMENT_MARKUP_PROBE, node.data)) {
					try {
						remove(node);
					} catch (_) {}
					return false;
				}
				if (nodeType === NODE_TYPE.element) {
					const element = node;
					const lcTag = transformCaseFunc(_readNodeName(node));
					try {
						if (element.hasAttribute && element.hasAttribute("patchsrc")) element.removeAttribute("patchsrc");
						if (element.hasAttribute && element.hasAttribute("for") && _isPatchLinkageAttribute("for", lcTag)) element.removeAttribute("for");
					} catch (_) {}
				}
				return true;
			});
		};
		/**
		* _initDocument
		*
		* @param dirty - a string of dirty markup
		* @return a DOM, filled with the dirty markup
		*/
		const _initDocument = function _initDocument(dirty) {
			let doc = null;
			let leadingWhitespace = null;
			if (FORCE_BODY) dirty = "<remove></remove>" + dirty;
			else {
				const matches = stringMatch(dirty, /^[\r\n\t ]+/);
				leadingWhitespace = matches && matches[0];
			}
			if (PARSER_MEDIA_TYPE === "application/xhtml+xml" && NAMESPACE === HTML_NAMESPACE) dirty = "<html xmlns=\"http://www.w3.org/1999/xhtml\"><head></head><body>" + dirty + "</body></html>";
			const dirtyPayload = trustedTypesPolicy ? _createTrustedHTML(dirty) : dirty;
			if (NAMESPACE === HTML_NAMESPACE) try {
				doc = new DOMParser().parseFromString(dirtyPayload, PARSER_MEDIA_TYPE);
			} catch (_) {}
			if (!doc || !doc.documentElement) {
				doc = implementation.createDocument(NAMESPACE, "template", null);
				try {
					doc.documentElement.innerHTML = IS_EMPTY_INPUT ? emptyHTML : dirtyPayload;
				} catch (_) {}
			}
			const body = doc.body || doc.documentElement;
			if (dirty && leadingWhitespace) body.insertBefore(document.createTextNode(leadingWhitespace), body.childNodes[0] || null);
			if (NAMESPACE === HTML_NAMESPACE) return getElementsByTagName.call(doc, WHOLE_DOCUMENT ? "html" : "body")[0];
			return WHOLE_DOCUMENT ? doc.documentElement : body;
		};
		/**
		* Creates a NodeIterator object that you can use to traverse filtered lists of nodes or elements in a document.
		*
		* @param root The root element or node to start traversing on.
		* @return The created NodeIterator
		*/
		const _createNodeIterator = function _createNodeIterator(root) {
			const doc = getOwnerDocument ? getOwnerDocument(root) : root.ownerDocument;
			return createNodeIterator.call(doc || root, root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_CDATA_SECTION, null);
		};
		/**
		* Replace template expression syntax (mustache, ERB, template
		* literal) with a space; shared by all SAFE_FOR_TEMPLATES scrub
		* sites. Order matters: mustache, then ERB, then template literal.
		*
		* @param value the string to scrub
		* @returns the scrubbed string
		*/
		const _stripTemplateExpressions = function _stripTemplateExpressions(value) {
			value = stringReplace(value, MUSTACHE_EXPR$1, " ");
			value = stringReplace(value, ERB_EXPR$1, " ");
			value = stringReplace(value, TMPLIT_EXPR$1, " ");
			return value;
		};
		/**
		* Strip template-engine expressions ({{...}}, ${...}, <%...%>) from the
		* character data of an element subtree. Used as the final safety net for
		* SAFE_FOR_TEMPLATES on every DOM-returning code path so that expressions
		* which only form after text-node normalization (e.g. fragments split across
		* stripped elements) cannot survive into a template-evaluating framework.
		*
		* Walks text/comment/CDATA/processing-instruction nodes and mutates `.data`
		* in place rather than round-tripping through innerHTML. This preserves
		* descendant node references (important for IN_PLACE callers), avoids a
		* serialize/reparse cycle, and reads literal character data — which means
		* `<%...%>` in text content matches the ERB regex against its real bytes
		* instead of the HTML-entity-escaped form innerHTML would produce.
		*
		* Attribute values are not visited here; SAFE_FOR_TEMPLATES handling for
		* attributes is performed during the per-node `_sanitizeAttributes` pass.
		*
		* @param node The root element whose character data should be scrubbed.
		*/
		const _scrubTemplateExpressions2 = function _scrubTemplateExpressions(node) {
			var _node$querySelectorAl;
			_scrubOwnCharacterData(node);
			const templates = (_node$querySelectorAl = node.querySelectorAll) === null || _node$querySelectorAl === void 0 ? void 0 : _node$querySelectorAl.call(node, "template");
			if (templates) arrayForEach(templates, (tmpl) => {
				if (_isDocumentFragment(tmpl.content)) _scrubTemplateExpressions2(tmpl.content);
			});
		};
		/**
		* _scrubOwnCharacterData
		*
		* Non-recursive core of _scrubTemplateExpressions: normalize `node` and
		* strip template expressions from its own character data only. Does not
		* enter <template>.content or attached shadow roots (NodeIterator never
		* does). Used by _sanitizeShadowDOM, where every nested template content
		* and shadow root is already walked - and therefore scrubbed - by its own
		* recursive _sanitizeShadowDOM call; recursing here as well would rescrub
		* each nested fragment once per ancestor, which is quadratic in nesting
		* depth.
		*
		* @param node The root whose own character data should be scrubbed.
		*/
		const _scrubOwnCharacterData = function _scrubOwnCharacterData(node) {
			node.normalize();
			const doc = getOwnerDocument ? getOwnerDocument(node) : node.ownerDocument;
			const walker = createNodeIterator.call(doc || node, node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_CDATA_SECTION | NodeFilter.SHOW_PROCESSING_INSTRUCTION, null);
			let currentNode = walker.nextNode();
			while (currentNode) {
				currentNode.data = _stripTemplateExpressions(currentNode.data);
				currentNode = walker.nextNode();
			}
		};
		/**
		* _isClobbered
		*
		* Detect DOM-clobbering on HTMLFormElement nodes. Form is the only HTML
		* interface with [LegacyOverrideBuiltIns]; a descendant element with a
		* `name` attribute matching a prototype property shadows that property
		* on direct reads. We use this check at the IN_PLACE entry-point and
		* during attribute sanitization to refuse clobbered forms.
		*
		* @param element element to check for clobbering attacks
		* @return true if clobbered, false if safe
		*/
		const _isClobbered = function _isClobbered(element) {
			const realTagName = getNodeName ? getNodeName(element) : null;
			if (typeof realTagName !== "string") return false;
			if (transformCaseFunc(realTagName) !== "form") return false;
			return typeof element.nodeName !== "string" || typeof element.textContent !== "string" || typeof element.removeChild !== "function" || element.attributes !== getAttributes(element) || typeof element.removeAttribute !== "function" || typeof element.removeAttributeNode !== "function" || typeof element.getAttributeNode !== "function" || typeof element.setAttribute !== "function" || typeof element.namespaceURI !== "string" || typeof element.insertBefore !== "function" || typeof element.hasChildNodes !== "function" || element.nodeType !== getNodeType(element) || element.childNodes !== getChildNodes(element);
		};
		/**
		* Checks whether the given value is a DocumentFragment from any realm.
		*
		* The realm-independent replacement reads `nodeType` through the cached
		* Node.prototype getter and compares to the DOCUMENT_FRAGMENT_NODE
		* constant (11). nodeType is a numeric value resolved from the node's
		* internal slot, identical across realms for the same kind of node.
		*
		* @param value object to check
		* @return true if value is a DocumentFragment-shaped node from any realm
		*/
		const _isDocumentFragment = function _isDocumentFragment(value) {
			if (!getNodeType || typeof value !== "object" || value === null) return false;
			try {
				return getNodeType(value) === NODE_TYPE.documentFragment;
			} catch (_) {
				return false;
			}
		};
		/**
		* Checks whether the given object is a DOM node, including nodes that
		* originate from a different window/realm (e.g. an iframe's
		* contentDocument). The previous `value instanceof Node` check was
		* realm-bound: nodes from a different window failed it, causing
		* sanitize() to silently stringify them and reset IN_PLACE to false,
		* returning the original node unsanitized. See GHSA-4w3q-35jp-p934.
		*
		* @param value object to check whether it's a DOM node
		* @return true if value is a DOM node from any realm
		*/
		const _isNode = function _isNode(value) {
			if (!getNodeType || typeof value !== "object" || value === null) return false;
			try {
				return typeof getNodeType(value) === "number";
			} catch (_) {
				return false;
			}
		};
		function _executeHooks(hooks, currentNode, data) {
			if (hooks.length === 0) return;
			arrayForEach(hooks, (hook) => {
				hook.call(DOMPurify, currentNode, data, CONFIG);
			});
		}
		/**
		* Structural-threat checks that condemn a node regardless of the
		* allowlists: mXSS via namespace confusion, risky CSS construction,
		* processing instructions, markup-bearing comments. Pure predicate;
		* the caller removes. Check order is load-bearing.
		*
		* @param currentNode the node to inspect
		* @param tagName the node's transformCaseFunc'd tag name
		* @return true if the node must be removed
		*/
		const _isUnsafeNode = function _isUnsafeNode(currentNode, tagName) {
			if (SAFE_FOR_XML && currentNode.hasChildNodes() && !_isNode(currentNode.firstElementChild) && regExpTest(ELEMENT_MARKUP_PROBE, currentNode.textContent) && regExpTest(ELEMENT_MARKUP_PROBE, currentNode.innerHTML)) return true;
			if (SAFE_FOR_XML && LITERAL_TEXT_ELEMENTS[tagName] && _readNodeType(currentNode) === NODE_TYPE.element && _readNamespaceURI(currentNode) === HTML_NAMESPACE && (_isNode(currentNode.firstElementChild) || typeof currentNode.textContent === "string" && regExpTest(ELEMENT_MARKUP_PROBE, currentNode.textContent))) return true;
			if (currentNode.nodeType === NODE_TYPE.processingInstruction) return true;
			if (SAFE_FOR_XML && currentNode.nodeType === NODE_TYPE.comment && regExpTest(COMMENT_MARKUP_PROBE, currentNode.data)) return true;
			return false;
		};
		/**
		* Evaluate a CUSTOM_ELEMENT_HANDLING check (a RegExp or a predicate
		* function, per the validation in _parseConfig) against a name.
		* Additional arguments are forwarded to predicate functions - the
		* attributeNameCheck predicate receives the tag name as its second
		* argument. A null/absent check never matches.
		*
		* @param check the configured tagNameCheck / attributeNameCheck value
		* @param name the name to test
		* @param args extra arguments forwarded to a predicate function
		* @return true if the check matches the name
		*/
		const _matchesNameCheck = function _matchesNameCheck(check, name) {
			if (check instanceof RegExp) return regExpTest(check, name);
			if (check instanceof Function) {
				for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) args[_key - 2] = arguments[_key];
				return Boolean(check(name, ...args));
			}
			return false;
		};
		/**
		* Handle a node whose tag is forbidden or not allowlisted: keep
		* allowed custom elements (false return exits _sanitizeElements
		* early - the namespace and fallback-tag removal checks are
		* intentionally skipped for kept custom elements), else hoist
		* content per KEEP_CONTENT and remove.
		*
		* A kept custom element is the ONLY case in which this function
		* returns false, so the caller uses that return value to run the
		* afterSanitizeElements hook on the kept element and keep the
		* element-hook lifecycle consistent with normal allowlisted
		* elements (GHSA-c2j3-45gr-mqc4).
		*
		* @param currentNode the disallowed node
		* @param tagName the node's transformCaseFunc'd tag name
		* @return true if the node was removed, false if kept
		*/
		const _sanitizeDisallowedNode = function _sanitizeDisallowedNode(currentNode, tagName, root) {
			if (!FORBID_TAGS[tagName] && _isBasicCustomElement(tagName) && _matchesNameCheck(CUSTOM_ELEMENT_HANDLING.tagNameCheck, tagName)) return false;
			if (KEEP_CONTENT && !FORBID_CONTENTS[tagName] && !FORBID_CONTENTS[stringToLowerCase(tagName)]) {
				const parentNode = getParentNode(currentNode);
				const childNodes = getChildNodes(currentNode);
				if (childNodes && parentNode) {
					const childCount = childNodes.length;
					for (let i = childCount - 1; i >= 0; --i) {
						const hoisted = currentNode === root ? cloneNode(childNodes[i], true) : childNodes[i];
						parentNode.insertBefore(hoisted, getNextSibling(currentNode));
					}
				}
			}
			_forceRemove(currentNode);
			return true;
		};
		/**
		* Fork a hook-mutable allowlist off its shared binding the first time a
		* (possibly lazily-installed) uponSanitize* hook is about to see it, so the
		* hook cannot widen the per-instance default or the setConfig binding by
		* reference and leak past the call. Returns the set unchanged once it is
		* already call-local, so repeated calls across elements are idempotent.
		*
		* @param hookList the uponSanitize* hook array for this event
		* @param set the current ALLOWED_TAGS / ALLOWED_ATTR binding
		* @param defaultSet the per-instance DEFAULT_ALLOWED_* constant
		* @param setConfigSet the captured setConfig() binding, or null
		* @return a call-local clone if a hook is present and set is still shared,
		*   else set unchanged
		*/
		const _forkSharedAllowlist = function _forkSharedAllowlist(hookList, set, defaultSet, setConfigSet) {
			if (hookList.length === 0) return set;
			return set === defaultSet || set === setConfigSet ? clone(set) : set;
		};
		/**
		* A hook may have detached the node it was called for. If so, treat it as
		* removed and stop processing it; the walk root is exempt. On the IN_PLACE
		* path the detached subtree is neutralized right away.
		*
		* @param currentNode the node a hook may have detached
		* @param root the current walk root
		* @return true if the node was detached
		*/
		const _handleHookDetachedNode = function _handleHookDetachedNode(currentNode, root) {
			if (currentNode === root || getParentNode(currentNode) !== null) return false;
			if (IN_PLACE) _neutralizeSubtree(currentNode);
			return true;
		};
		/**
		* _sanitizeElements
		*
		* @protect nodeName
		* @protect textContent
		* @protect removeChild
		* @param currentNode to check for permission to exist
		* @return true if node was killed, false if left alive
		*/
		const _sanitizeElements = function _sanitizeElements(currentNode, root) {
			_markVisited(currentNode);
			_executeHooks(hooks.beforeSanitizeElements, currentNode, null);
			if (_handleHookDetachedNode(currentNode, root)) return true;
			if (_isClobbered(currentNode)) {
				_forceRemove(currentNode);
				return true;
			}
			const tagName = transformCaseFunc(_readNodeName(currentNode));
			ALLOWED_TAGS = _forkSharedAllowlist(hooks.uponSanitizeElement, ALLOWED_TAGS, DEFAULT_ALLOWED_TAGS, SET_CONFIG_ALLOWED_TAGS);
			_executeHooks(hooks.uponSanitizeElement, currentNode, {
				tagName,
				allowedTags: ALLOWED_TAGS
			});
			if (_handleHookDetachedNode(currentNode, root)) return true;
			if (_isUnsafeNode(currentNode, tagName)) {
				_forceRemove(currentNode);
				return true;
			}
			if (FORBID_TAGS[tagName] || !(EXTRA_ELEMENT_HANDLING.tagCheck instanceof Function && EXTRA_ELEMENT_HANDLING.tagCheck(tagName)) && !ALLOWED_TAGS[tagName]) {
				const removed = _sanitizeDisallowedNode(currentNode, tagName, root);
				if (removed === false) {
					_executeHooks(hooks.afterSanitizeElements, currentNode, null);
					if (_handleHookDetachedNode(currentNode, root)) return true;
				}
				return removed;
			}
			if (_readNodeType(currentNode) === NODE_TYPE.element && !_checkValidNamespace(currentNode)) {
				_forceRemove(currentNode);
				return true;
			}
			if ((tagName === "noscript" || tagName === "noembed" || tagName === "noframes") && regExpTest(FALLBACK_TAG_CLOSE, currentNode.innerHTML)) {
				_forceRemove(currentNode);
				return true;
			}
			if (SAFE_FOR_TEMPLATES && currentNode.nodeType === NODE_TYPE.text) {
				const content = _stripTemplateExpressions(currentNode.textContent);
				if (currentNode.textContent !== content) {
					arrayPush(DOMPurify.removed, { element: currentNode.cloneNode() });
					currentNode.textContent = content;
				}
			}
			_executeHooks(hooks.afterSanitizeElements, currentNode, null);
			return _handleHookDetachedNode(currentNode, root);
		};
		/**
		* _isValidAttribute
		*
		* @param lcTag Lowercase tag name of containing element.
		* @param lcName Lowercase attribute name.
		* @param value Attribute value.
		* @return Returns true if `value` is valid, otherwise false.
		*/
		const _isValidAttribute = function _isValidAttribute(lcTag, lcName, value) {
			if (FORBID_ATTR[lcName]) return false;
			if (_isPatchLinkageAttribute(lcName, lcTag)) return false;
			if (SANITIZE_DOM && (lcName === "id" || lcName === "name") && (value in document || value in formElement)) return false;
			const nameIsPermitted = ALLOWED_ATTR[lcName] || EXTRA_ELEMENT_HANDLING.attributeCheck instanceof Function && EXTRA_ELEMENT_HANDLING.attributeCheck(lcName, lcTag);
			if (ALLOW_DATA_ATTR && regExpTest(DATA_ATTR$1, lcName)) return true;
			if (ALLOW_ARIA_ATTR && regExpTest(ARIA_ATTR$1, lcName)) return true;
			if (!nameIsPermitted) return _isBasicCustomElement(lcTag) && _matchesNameCheck(CUSTOM_ELEMENT_HANDLING.tagNameCheck, lcTag) && _matchesNameCheck(CUSTOM_ELEMENT_HANDLING.attributeNameCheck, lcName, lcTag) || lcName === "is" && CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements && _matchesNameCheck(CUSTOM_ELEMENT_HANDLING.tagNameCheck, value);
			if (URI_SAFE_ATTRIBUTES[lcName]) return true;
			if (regExpTest(IS_ALLOWED_URI$1, stringReplace(value, ATTR_WHITESPACE$1, ""))) return true;
			if ((lcName === "src" || lcName === "xlink:href" || lcName === "href") && lcTag !== "script" && stringIndexOf(value, "data:") === 0 && DATA_URI_TAGS[lcTag]) return true;
			if (ALLOW_UNKNOWN_PROTOCOLS && !regExpTest(IS_SCRIPT_OR_DATA$1, stringReplace(value, ATTR_WHITESPACE$1, ""))) return true;
			return !value;
		};
		const RESERVED_CUSTOM_ELEMENT_NAMES = addToSet({}, [
			"annotation-xml",
			"color-profile",
			"font-face",
			"font-face-format",
			"font-face-name",
			"font-face-src",
			"font-face-uri",
			"missing-glyph"
		]);
		/**
		* _isBasicCustomElement
		* checks if at least one dash is included in tagName, and it's not the first char
		* for more sophisticated checking see https://github.com/sindresorhus/validate-element-name
		*
		* @param tagName name of the tag of the node to sanitize
		* @returns Returns true if the tag name meets the basic criteria for a custom element, otherwise false.
		*/
		const _isBasicCustomElement = function _isBasicCustomElement(tagName) {
			return !RESERVED_CUSTOM_ELEMENT_NAMES[stringToLowerCase(tagName)] && regExpTest(CUSTOM_ELEMENT$1, tagName);
		};
		/**
		* Wrap an attribute value in the matching Trusted Types object when
		* the active policy requires it. Namespaced attributes pass through
		* unchanged (no TT support yet, see
		* https://bugs.chromium.org/p/chromium/issues/detail?id=1305293).
		*
		* @param lcTag lowercase tag name of the containing element
		* @param lcName lowercase attribute name
		* @param namespaceURI the attribute's namespace, if any
		* @param value the attribute value to wrap
		* @return the value, wrapped when Trusted Types demand it
		*/
		const _applyTrustedTypesToAttribute = function _applyTrustedTypesToAttribute(lcTag, lcName, namespaceURI, value) {
			if (trustedTypesPolicy && typeof trustedTypes === "object" && typeof trustedTypes.getAttributeType === "function" && !namespaceURI) switch (trustedTypes.getAttributeType(lcTag, lcName)) {
				case "TrustedHTML": return _createTrustedHTML(value);
				case "TrustedScriptURL": return _createTrustedScriptURL(value);
			}
			return value;
		};
		/**
		* Write a modified attribute value back onto the element. On
		* success, re-probe for clobbering introduced by the new value and
		* remove the element when found; otherwise, when this writeback is the
		* recreate half of the SANITIZE_NAMED_PROPS remove-and-recreate, pop the
		* removal entry that path recorded so it does not show as removed. On
		* failure, remove the attribute instead.
		*
		* Returns true only on a clean write (the value was set and the new value
		* introduced no clobbering). The caller uses that, together with its own
		* knowledge of whether this attribute pushed a DOMPurify.removed record, to
		* decide whether to pop that record. The pop must happen ONLY for the
		* named-prop remove-and-recreate; popping on any other value change (trim,
		* template scrubbing, Trusted Types) would consume an unrelated _forceRemove
		* subtree-cleanup record and let that detached subtree keep a live event
		* handler through the IN_PLACE neutralization pass (SO-001).
		*
		* @param currentNode the element carrying the attribute
		* @param name the attribute name as present on the element
		* @param namespaceURI the attribute's namespace, if any
		* @param value the new attribute value
		* @return true if the value was written without introducing clobbering
		*/
		const _setAttributeValue = function _setAttributeValue(currentNode, name, namespaceURI, value) {
			try {
				if (namespaceURI) currentNode.setAttributeNS(namespaceURI, name, value);
				else currentNode.setAttribute(name, value);
				if (_isClobbered(currentNode)) {
					_forceRemove(currentNode);
					return false;
				}
				return true;
			} catch (_) {
				_removeAttribute(name, currentNode);
				return false;
			}
		};
		/**
		* _isUnsafeAttributeValue
		*
		* Value-based attribute checks that the attribute walk applies before any
		* hook can force-keep an attribute, shared with the public
		* isValidAttribute() so that it never approves a value sanitize() would
		* strip.
		*
		* @param name the attribute name as found on the node (case preserved)
		* @param value the attribute value
		* @returns true if the attribute must be removed because of its value
		*/
		const _isUnsafeAttributeValue = function _isUnsafeAttributeValue(name, value) {
			if (SAFE_FOR_XML && regExpTest(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i, value)) return true;
			return stringToLowerCase(name) === "attributename" && stringMatch(value, "href") !== null;
		};
		/**
		* _sanitizeAttributes
		*
		* @protect attributes
		* @protect nodeName
		* @protect removeAttribute
		* @protect setAttribute
		*
		* @param currentNode to sanitize
		* @param root the current walk root
		*/
		const _sanitizeAttributes = function _sanitizeAttributes(currentNode, root) {
			_executeHooks(hooks.beforeSanitizeAttributes, currentNode, null);
			if (_handleHookDetachedNode(currentNode, root)) return;
			const attributes = currentNode.attributes;
			if (!attributes || _isClobbered(currentNode)) return;
			ALLOWED_ATTR = _forkSharedAllowlist(hooks.uponSanitizeAttribute, ALLOWED_ATTR, DEFAULT_ALLOWED_ATTR, SET_CONFIG_ALLOWED_ATTR);
			const hookEvent = {
				attrName: "",
				attrValue: "",
				keepAttr: true,
				allowedAttributes: ALLOWED_ATTR,
				forceKeepAttr: void 0
			};
			let l = attributes.length;
			const lcTag = transformCaseFunc(currentNode.nodeName);
			while (l--) {
				const attr = attributes[l];
				const name = attr.name, namespaceURI = attr.namespaceURI, attrValue = attr.value;
				const lcName = transformCaseFunc(name);
				const initValue = attrValue;
				let value = name === "value" ? initValue : stringTrim(initValue);
				let recreatedNamedProp = false;
				hookEvent.attrName = lcName;
				hookEvent.attrValue = value;
				hookEvent.keepAttr = true;
				hookEvent.forceKeepAttr = void 0;
				_executeHooks(hooks.uponSanitizeAttribute, currentNode, hookEvent);
				value = hookEvent.attrValue;
				if (SANITIZE_NAMED_PROPS && (lcName === "id" || lcName === "name") && stringIndexOf(value, SANITIZE_NAMED_PROPS_PREFIX) !== 0) {
					_removeAttribute(name, currentNode, attr);
					value = SANITIZE_NAMED_PROPS_PREFIX + value;
					recreatedNamedProp = true;
				}
				if (_isUnsafeAttributeValue(name, value)) {
					_removeAttribute(name, currentNode, attr);
					continue;
				}
				if (hookEvent.forceKeepAttr) continue;
				if (!hookEvent.keepAttr) {
					_removeAttribute(name, currentNode, attr);
					continue;
				}
				if (!ALLOW_SELF_CLOSE_IN_ATTR && regExpTest(SELF_CLOSING_TAG, value)) {
					_removeAttribute(name, currentNode, attr);
					continue;
				}
				if (SAFE_FOR_TEMPLATES) value = _stripTemplateExpressions(value);
				if (!_isValidAttribute(lcTag, lcName, value)) {
					_removeAttribute(name, currentNode, attr);
					continue;
				}
				value = _applyTrustedTypesToAttribute(lcTag, lcName, namespaceURI, value);
				if (value !== initValue) {
					if (_setAttributeValue(currentNode, name, namespaceURI, value) && recreatedNamedProp) arrayPop(DOMPurify.removed);
				}
			}
			_executeHooks(hooks.afterSanitizeAttributes, currentNode, null);
			_handleHookDetachedNode(currentNode, root);
		};
		/**
		* _sanitizeShadowDOM
		*
		* @param fragment to iterate over recursively
		*/
		const _sanitizeShadowDOM2 = function _sanitizeShadowDOM(fragment) {
			let shadowNode = null;
			const shadowIterator = _createNodeIterator(fragment);
			_executeHooks(hooks.beforeSanitizeShadowDOM, fragment, null);
			while (shadowNode = shadowIterator.nextNode()) {
				_executeHooks(hooks.uponSanitizeShadowNode, shadowNode, null);
				_sanitizeElements(shadowNode, fragment);
				_sanitizeAttributes(shadowNode, fragment);
				if (_isDocumentFragment(shadowNode.content)) _sanitizeShadowDOM2(shadowNode.content);
				if (_readNodeType(shadowNode) === NODE_TYPE.element) {
					const innerSr = getShadowRoot(shadowNode);
					if (_isDocumentFragment(innerSr)) {
						_sanitizeAttachedShadowRoots(innerSr);
						_sanitizeShadowDOM2(innerSr);
					}
				}
			}
			if (SAFE_FOR_TEMPLATES) _scrubOwnCharacterData(fragment);
			_executeHooks(hooks.afterSanitizeShadowDOM, fragment, null);
		};
		/**
		* Sanitizes every attached shadow root under `root`, since the node
		* iterator does not enter shadow trees. Needed for IN_PLACE input and for
		* DOM input whose clonable shadow roots were copied by importNode().
		*
		* @param root the subtree root to walk for attached shadow roots
		*/
		const _sanitizeAttachedShadowRoots = function _sanitizeAttachedShadowRoots(root) {
			const stack = [{
				node: root,
				shadow: null
			}];
			while (stack.length > 0) {
				const item = stack.pop();
				if (item.shadow) {
					_sanitizeShadowDOM2(item.shadow);
					continue;
				}
				const node = item.node;
				const isElement = _readNodeType(node) === NODE_TYPE.element;
				const childNodes = getChildNodes(node);
				if (childNodes) for (let i = childNodes.length - 1; i >= 0; --i) stack.push({
					node: childNodes[i],
					shadow: null
				});
				if (isElement) {
					const rootName = getNodeName ? getNodeName(node) : null;
					if (typeof rootName === "string" && transformCaseFunc(rootName) === "template") {
						const content = node.content;
						if (_isDocumentFragment(content)) stack.push({
							node: content,
							shadow: null
						});
					}
				}
				if (isElement) {
					const sr = getShadowRoot(node);
					if (_isDocumentFragment(sr)) stack.push({
						node: null,
						shadow: sr
					}, {
						node: sr,
						shadow: null
					});
				}
			}
		};
		DOMPurify.sanitize = function(dirty) {
			let cfg = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
			let body = null;
			let importedNode = null;
			let currentNode = null;
			let returnNode = null;
			IS_EMPTY_INPUT = !dirty;
			if (IS_EMPTY_INPUT) dirty = "<!-->";
			if (typeof dirty !== "string" && !_isNode(dirty)) {
				dirty = stringifyValue(dirty);
				if (typeof dirty !== "string") throw typeErrorCreate("dirty is not a string, aborting");
			}
			if (!DOMPurify.isSupported) return dirty;
			if (SET_CONFIG) {
				ALLOWED_TAGS = SET_CONFIG_ALLOWED_TAGS;
				ALLOWED_ATTR = SET_CONFIG_ALLOWED_ATTR;
			} else _parseConfig(cfg);
			if (hooks.uponSanitizeElement.length > 0 || hooks.uponSanitizeAttribute.length > 0) ALLOWED_TAGS = clone(ALLOWED_TAGS);
			if (hooks.uponSanitizeAttribute.length > 0) ALLOWED_ATTR = clone(ALLOWED_ATTR);
			DOMPurify.removed = [];
			const inPlace = IN_PLACE && typeof dirty !== "string" && _isNode(dirty);
			let inPlaceNodes = [];
			const outerVisited = IN_PLACE_VISITED;
			if (inPlace) {
				_neutralizePatchLinkage(dirty);
				const nn = _readNodeName(dirty);
				if (typeof nn === "string") {
					const tagName = transformCaseFunc(nn);
					if (!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName]) {
						_neutralizeRoot(dirty);
						throw typeErrorCreate("root node is forbidden and cannot be sanitized in-place");
					}
				}
				if (_isClobbered(dirty)) {
					_neutralizeRoot(dirty);
					throw typeErrorCreate("root node is clobbered and cannot be sanitized in-place");
				}
				inPlaceNodes = _collectLiveNodes(dirty);
				IN_PLACE_VISITED = setCreate();
			} else if (_isNode(dirty)) {
				body = _initDocument("<!---->");
				importedNode = body.ownerDocument.importNode(dirty, true);
				if (importedNode.nodeType === NODE_TYPE.element && importedNode.nodeName === "BODY") body = importedNode;
				else if (importedNode.nodeName === "HTML") body = importedNode;
				else body.appendChild(importedNode);
				_sanitizeAttachedShadowRoots(body);
			} else {
				if (!RETURN_DOM && !SAFE_FOR_TEMPLATES && !WHOLE_DOCUMENT && dirty.indexOf("<") === -1) return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? _createTrustedHTML(dirty) : dirty;
				body = _initDocument(dirty);
				if (!body) return RETURN_DOM ? null : RETURN_TRUSTED_TYPE ? emptyHTML : "";
			}
			if (body && FORCE_BODY) _forceRemove(body.firstChild);
			const walkRoot = inPlace ? dirty : body;
			try {
				if (inPlace) _sanitizeAttachedShadowRoots(dirty);
				const nodeIterator = _createNodeIterator(walkRoot);
				while (currentNode = nodeIterator.nextNode()) {
					_sanitizeElements(currentNode, walkRoot);
					_sanitizeAttributes(currentNode, walkRoot);
					if (_isDocumentFragment(currentNode.content)) _sanitizeShadowDOM2(currentNode.content);
				}
				if (inPlace) _sanitizeUnvisitedNodes(dirty, inPlaceNodes);
			} catch (error) {
				if (inPlace) {
					_neutralizeRoot(dirty);
					_neutralizeDiscarded(dirty, inPlaceNodes);
				}
				throw error;
			} finally {
				IN_PLACE_VISITED = outerVisited;
			}
			if (inPlace) {
				if (_neutralizeDiscarded(dirty, inPlaceNodes)) throw typeErrorCreate("a node selected for removal could not be safely returned; refusing to sanitize in place");
				if (SAFE_FOR_TEMPLATES) _scrubTemplateExpressions2(dirty);
				return dirty;
			}
			if (RETURN_DOM) {
				if (SAFE_FOR_TEMPLATES) _scrubTemplateExpressions2(body);
				if (RETURN_DOM_FRAGMENT) {
					returnNode = createDocumentFragment.call(body.ownerDocument);
					while (body.firstChild) returnNode.appendChild(body.firstChild);
				} else returnNode = body;
				if (ALLOWED_ATTR.shadowroot || ALLOWED_ATTR.shadowrootmode) returnNode = importNode.call(originalDocument, returnNode, true);
				return returnNode;
			}
			let serializedHTML = WHOLE_DOCUMENT ? body.outerHTML : body.innerHTML;
			if (WHOLE_DOCUMENT && ALLOWED_TAGS["!doctype"] && body.ownerDocument && body.ownerDocument.doctype && body.ownerDocument.doctype.name && regExpTest(DOCTYPE_NAME, body.ownerDocument.doctype.name)) serializedHTML = "<!DOCTYPE " + body.ownerDocument.doctype.name + ">\n" + serializedHTML;
			if (SAFE_FOR_TEMPLATES) serializedHTML = _stripTemplateExpressions(serializedHTML);
			return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? _createTrustedHTML(serializedHTML) : serializedHTML;
		};
		DOMPurify.setConfig = function() {
			let cfg = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
			_parseConfig(cfg);
			SET_CONFIG = true;
			SET_CONFIG_ALLOWED_TAGS = ALLOWED_TAGS;
			SET_CONFIG_ALLOWED_ATTR = ALLOWED_ATTR;
		};
		DOMPurify.clearConfig = function() {
			CONFIG = null;
			SET_CONFIG = false;
			SET_CONFIG_ALLOWED_TAGS = null;
			SET_CONFIG_ALLOWED_ATTR = null;
			trustedTypesPolicy = defaultTrustedTypesPolicy;
			emptyHTML = "";
		};
		DOMPurify.isValidAttribute = function(tag, attr, value) {
			if (!CONFIG) _parseConfig({});
			const lcTag = transformCaseFunc(tag);
			const lcName = transformCaseFunc(attr);
			if (typeof value === "string" && (_isUnsafeAttributeValue(attr, value) || !ALLOW_SELF_CLOSE_IN_ATTR && regExpTest(SELF_CLOSING_TAG, value))) return false;
			return _isValidAttribute(lcTag, lcName, value);
		};
		DOMPurify.addHook = function(entryPoint, hookFunction) {
			if (typeof hookFunction !== "function") return;
			if (!objectHasOwnProperty(hooks, entryPoint)) return;
			arrayPush(hooks[entryPoint], hookFunction);
		};
		DOMPurify.removeHook = function(entryPoint, hookFunction) {
			if (!objectHasOwnProperty(hooks, entryPoint)) return;
			if (hookFunction !== void 0) {
				const index = arrayLastIndexOf(hooks[entryPoint], hookFunction);
				return index === -1 ? void 0 : arraySplice(hooks[entryPoint], index, 1)[0];
			}
			return arrayPop(hooks[entryPoint]);
		};
		DOMPurify.removeHooks = function(entryPoint) {
			if (!objectHasOwnProperty(hooks, entryPoint)) return;
			hooks[entryPoint] = [];
		};
		DOMPurify.removeAllHooks = function() {
			hooks = _createHooksMap();
		};
		return DOMPurify;
	}
	return createDOMPurify();
});

//# sourceMappingURL=purify.js.map
'use strict';

// Shared by the isolated extractor and the reader document. No privileges.
// Sanitize into a detached fragment, resolve its URLs, then sanitize again
// before insertion. Never let an article choose a reader asset or IPC action.
((root) => {
  function sanitizeArticle(document, purify, html, sourceUrl, imageUrls = null) {
    const tags = ['article', 'section', 'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a', 'img', 'figure', 'figcaption', 'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'pre', 'code',
      'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup', 'br', 'hr', 'span', 'time'];
    const options = { ALLOWED_TAGS: tags,
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'id', 'lang', 'dir', 'colspan', 'rowspan', 'start',
        ...(imageUrls ? ['data-reader-image'] : [])],
      ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false, RETURN_DOM_FRAGMENT: true };
    const fragment = purify.sanitize(html, options);
    const images = [];
    const urlFor = (value) => {
      try {
        const url = new URL(value, sourceUrl);
        return /^https?:$/.test(url.protocol) && !url.username && !url.password && url.href.length <= 8192 ? url : null;
      } catch { return null; }
    };
    const source = new URL(sourceUrl);
    const readerId = value => value.startsWith('reader-content-') ? value : `reader-content-${value}`;
    for (const node of fragment.querySelectorAll('[id]')) node.id = readerId(node.id);
    for (const link of fragment.querySelectorAll('a')) {
      const url = urlFor(link.getAttribute('href') || '');
      link.removeAttribute('href');
      if (url) {
        const sameDocument = url.origin === source.origin && url.pathname === source.pathname && url.search === source.search;
        let fragmentId = null;
        try { if (sameDocument && url.hash) fragmentId = readerId(decodeURIComponent(url.hash.slice(1))); } catch {}
        link.setAttribute('href', fragmentId ? `#${encodeURIComponent(fragmentId)}` : url.href);
        link.setAttribute('rel', 'noreferrer noopener');
      }
    }
    for (const image of fragment.querySelectorAll('img')) {
      const imageIndex = image.getAttribute('data-reader-image');
      const raw = imageUrls && /^(0|[1-9]\d?)$/.test(imageIndex || '')
        ? imageUrls[Number(imageIndex)] : image.getAttribute('src');
      image.removeAttribute('src');
      image.removeAttribute('data-reader-image');
      const url = raw ? urlFor(raw) : null;
      const permitted = url && (!imageUrls || imageUrls.includes(url.href));
      if (permitted && images.length < 100) {
        const index = images.push(url.href) - 1;
        image.setAttribute('data-reader-image', String(index));
      }
    }
    const holder = document.createElement('div');
    holder.append(fragment);
    return { content: holder.innerHTML, images };
  }
  root.blancReaderContent = { sanitizeArticle };
})(typeof self === 'object' ? self : globalThis);


    if (!['text/html', 'application/xhtml+xml'].includes(document.contentType)) return null;
    if (document.getElementsByTagName('*').length > 50000) return null;
    if (document.documentElement.outerHTML.length > 5242880) return null;
    const clone = document.cloneNode(true);
    // Content hidden behind a consent gate, paywall, or collapsed section
    // must not become newly visible through extraction. Do not expand it.
    const originals = document.querySelectorAll('*');
    const copies = clone.querySelectorAll('*');
    for (let i = originals.length - 1; i >= 0; i--) {
      const original = originals[i], copy = copies[i];
      if (!copy || ['HTML', 'HEAD', 'BODY'].includes(original.tagName) || document.head?.contains(original)) continue;
      if (original.hidden || original.getAttribute('aria-hidden') === 'true'
          || (typeof original.checkVisibility === 'function' && !original.checkVisibility({checkVisibilityCSS: true, checkOpacity: true}))) copy.remove();
      if (original.tagName === 'IMG' && original.currentSrc) copy.setAttribute('src', original.currentSrc);
    }
    const article = new Readability(clone, { maxElemsToParse: 50000 }).parse();
    if (!article || !article.textContent || article.textContent.trim().length < 200) return null;
    const clean = blancReaderContent.sanitizeArticle(document, DOMPurify, article.content, location.href);
    if (clean.content.length > 5242880) return null;
    const text = value => typeof value === 'string' ? value.slice(0, 1000) : '';
    return { content: clean.content, images: clean.images, textContent: article.textContent.slice(0, 5242880),
      title: text(article.title), byline: text(article.byline), publishedTime: text(article.publishedTime),
      lang: text(article.lang), dir: article.dir === 'rtl' ? 'rtl' : 'ltr' };
  })();
  if (!article) return null;
  article.imageData = {};
  let total = 0;
  let totalPixels = 0;
  const loaded = Array.from(document.images);
  // WKContentRuleList has no per-request query API. Reuse only images that
  // WebKit already loaded under the source tab's policy; never fetch around it.
  for (let i = 0; i < Math.min(article.images.length, 30); i++) {
    const image = loaded.find(img => img.currentSrc === article.images[i] && img.complete && img.naturalWidth > 0);
    if (!image || image.naturalWidth * image.naturalHeight > 4000000
        || totalPixels + image.naturalWidth * image.naturalHeight > 16000000) continue;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      const data = canvas.toDataURL('image/png');
      if (data.length > 5000000 || total + data.length > 20000000) continue;
      total += data.length; totalPixels += image.naturalWidth * image.naturalHeight; article.imageData[i] = data;
    } catch { /* Cross-origin canvas restrictions: retain alt text/caption. */ }
  }
  return article;
})()