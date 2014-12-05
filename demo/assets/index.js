(function () {
  'use strict';

  var mdHtml, mdSrc, permalink, scrollMap, codeMirror;

  var defaults = {
    html:         false,        // Enable HTML tags in source
    xhtmlOut:     false,        // Use '/' to close single tags (<br />)
    breaks:       false,        // Convert '\n' in paragraphs into <br>
    langPrefix:   'language-',  // CSS language prefix for fenced blocks
    linkify:      true,         // autoconvert URL-like texts to links
    typographer:  true,         // Enable smartypants and other sweet transforms

    // options below are for demo only
    _highlight: true,
    _strict: false,
    _view: 'html'               // html / src / debug
  };

  defaults.highlight = function (str, lang) {
    if (!defaults._highlight) { return ''; }

    var hljs = window.hljs;
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(lang, str).value;
      } catch (__) {}
    }

    try {
      return hljs.highlightAuto(str).value;
    } catch (__) {}

    return '';
  };

  function setOptionClass(name, val) {
    if (val) {
      $('body').addClass('opt_' + name);
    } else {
      $('body').removeClass('opt_' + name);
    }
  }

  function setResultView(val) {
    $('body').removeClass('result-as-html');
    $('body').removeClass('result-as-src');
    $('body').removeClass('result-as-debug');
    $('body').addClass('result-as-' + val);
    defaults._view = val;
  }

  function mdInit() {
    if (defaults._strict) {
      mdHtml = new window.Remarkable('commonmark');
      mdSrc = new window.Remarkable('commonmark');
    } else {
      mdHtml = new window.Remarkable('full', defaults);
      mdSrc = new window.Remarkable('full', defaults);
    }

    // Beautify output of parser for html content
    mdHtml.renderer.rules.table_open = function () {
      return '<table class="table table-striped">\n';
    };

    mdHtml.renderer.rules.paragraph_open = function (tokens, idx) {
      var line = tokens[idx].lines ? tokens[idx].lines[0] : '';
      return '<p class="line" data-line="' + line + '">';
    };

    mdHtml.renderer.rules.heading_open = function (tokens, idx) {
      var line = tokens[idx].lines ? tokens[idx].lines[0] : '';
      return '<h' + tokens[idx].hLevel + ' class="line" data-line="' + line + '">';
    };
  }

  function updateResult() {
    var source = $('.source').val();

    $('.result-html').html(mdHtml.render(source));
    $('.result-src-content').html(window.hljs.highlight('html', mdSrc.render(source)).value);
    scrollMap = null;

    var dump = JSON.stringify(mdSrc.parse(source, { references: {} }), null, 2);
    $('.result-debug-content').html(window.hljs.highlight('json', dump).value);

    try {
      if (source) {
        // serialize state - source and options
        permalink.href = '#md64=' + window.btoa(JSON.stringify({
          source: source,
          defaults: _.omit(defaults, 'highlight')
        }));
      } else {
        permalink.href = '';
      }
    } catch (__) {
      permalink.href = '';
    }
  }

  function caretFromPoint(x, y) {
    if (typeof(document.caretPositionFromPoint) === 'function') {
      // newer W3C draft, supported by Gecko (Firefox)
      return document.caretPositionFromPoint(~~x, ~~y).offset;
    } else if (typeof(document.caretRangeFromPoint) === 'function') {
      // older W3C draft, supported by WebKit (Chromium and forks)
      // return document.caretRangeFromPoint(~~x, ~~y).startOffset;
    } else {
      // we can try to use `TextRange.moveToPoint(x, y)` for IE,
      // but I don't have one to test this
    }
  }

  function recomputeScroll() {
    var i, offset, nonEmptyList, pos, a, b, d,
        textarea = $('.source'),
        linesCount = textarea.val().split('\n').length;

    offset = $('.result-html').scrollTop() - $('.result-html').offset().top;
    scrollMap = [];
    nonEmptyList = [];
    for (i = 0; i < linesCount; i++) { scrollMap.push(-1); }

    nonEmptyList.push(0);
    scrollMap[0] = 0;

    $('.line').each(function(n, el) {
      var $el = $(el), t = $el.data('line');
      if (t === '') { return; }
      nonEmptyList.push(t);
      scrollMap[t] = Math.round($el.offset().top + offset);
    });

    nonEmptyList.push(linesCount);
    scrollMap[linesCount] = $('.result-html')[0].scrollHeight;

    pos = 0;
    for (i = 1; i < linesCount; i++) {
      if (scrollMap[i] !== -1) {
        pos++;
        continue;
      }

      a = nonEmptyList[pos];
      b = nonEmptyList[pos + 1];
      scrollMap[i] = Math.round((scrollMap[b] * (i - a) + scrollMap[a] * (b - i)) / (b - a));
    }

    return scrollMap;
  }

  function syncScroll() {
    var textarea  = $('.source'),
        offset    = textarea.offset(),
        skipLines,
        caretPos,
        lineNo,
        scrollTo;

/*    caretPos = caretFromPoint(offset.left + 5, offset.top + 5);
    if (!caretPos || caretPos === 1) {
      caretPos = caretFromPoint(offset.left + 5, offset.top + 15);
    }
    if (!caretPos || caretPos === 1) {
      return;
    }

    lineNo = textarea.val().slice(0, caretPos).split('\n').length;*/
    lineNo = codeMirror.getViewport().from;

    if (!scrollMap) { recomputeScroll(); }

    $('.result-html').scrollTop(scrollMap[lineNo]);
  }

  $(function() {
    // highlight snippet
    $('pre.code-sample code').each(function(i, block) {
      window.hljs.highlightBlock(block);
    });

    // Restore content if opened by permalink
    if (location.hash && /^(#md=|#md64=)/.test(location.hash)) {
      try {
        var cfg;

        if (/^#md64=/.test(location.hash)) {
          cfg = JSON.parse(window.atob(location.hash.slice(6)));
        } else {
          // Legacy mode for old links. Those become broken in github posts,
          // so we switched to base64 encoding.
          cfg = JSON.parse(decodeURIComponent(location.hash.slice(4)));
        }

        if (_.isString(cfg.source)) {
          $('.source').val(cfg.source);
        }

        var opts = _.isObject(cfg.defaults) ? cfg.defaults : {};

        // copy config to defaults, but only if key exists
        // and value has the same type
        _.forOwn(opts, function (val, key) {
          if (!_.has(defaults, key)) { return; }

          // Legacy, for old links
          if (key === '_src') {
            defaults._view = val ? 'src' : 'html';
            return;
          }

          if ((_.isBoolean(defaults[key]) && _.isBoolean(val)) ||
              (_.isString(defaults[key]) && _.isString(val))) {
            defaults[key] = val;
          }
        });

        // sanitize for sure
        if ([ 'html', 'src', 'debug' ].indexOf(defaults._view) === -1) {
          defaults._view = 'html';
        }
      } catch (__) {}
    }

    // Activate tooltips
    $('._tip').tooltip({ container: 'body' });

    // Set default option values and option listeners
    _.forOwn(defaults, function (val, key) {
      if (key === 'highlight') { return; }

      var el = document.getElementById(key);

      if (!el) { return; }

      var $el = $(el);

      if (_.isBoolean(val)) {
        $el.prop('checked', val);
        $el.on('change', function () {
          var value = Boolean($el.prop('checked'));
          setOptionClass(key, value);
          defaults[key] = value;
          mdInit();
          updateResult();
        });
        setOptionClass(key, val);

      } else {
        $(el).val(val);
        $el.on('change update keyup', function () {
          defaults[key] = String($(el).val());
          mdInit();
          updateResult();
        });
      }
    });

    setResultView(defaults._view);

    mdInit();
    permalink = document.getElementById('permalink');

    codeMirror = window.CodeMirror.fromTextArea($('.source')[0], {
      lineWrapping: true
    });

    // Setup listeners
    $('.source').on('keyup paste cut mouseup', updateResult);
    //$('.source').on('scroll', syncScroll);
    codeMirror.on('viewportChange', syncScroll);
    //$('.CodeMirror .CodeMirror-scroll').on('scroll', syncScroll);

    $('.source-clear').on('click', function (event) {
      $('.source').val('');
      updateResult();
      event.preventDefault();
    });

    $(document).on('click', '[data-result-as]', function (event) {
      var view = $(this).data('resultAs');
      if (view) {
        setResultView(view);
        // only to update permalink
        updateResult();
        event.preventDefault();
      }
    });

    updateResult();
  });
})();
