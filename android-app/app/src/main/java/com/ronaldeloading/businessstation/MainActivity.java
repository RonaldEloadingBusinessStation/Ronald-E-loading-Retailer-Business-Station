package com.ronaldeloading.businessstation;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebResourceRequest;
import android.net.Uri;
import android.content.Intent;

public class MainActivity extends Activity {
  private WebView web;
  private static final String SITE = "https://ronald-e-loading-retailer-business.onrender.com/retailer";
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    web = new WebView(this);
    WebSettings settings = web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if ("https".equals(uri.getScheme()) && ("ronald-e-loading-retailer-business.onrender.com".equals(uri.getHost()) || "ronaldeloadingbusinessstation.github.io".equals(uri.getHost()))) return false;
        startActivity(new Intent(Intent.ACTION_VIEW, uri)); return true;
      }
    });
    web.setWebChromeClient(new WebChromeClient()); setContentView(web); web.loadUrl(SITE);
  }
  @Override public void onBackPressed() { if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
