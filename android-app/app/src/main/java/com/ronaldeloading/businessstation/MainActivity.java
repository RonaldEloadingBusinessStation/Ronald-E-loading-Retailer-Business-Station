package com.ronaldeloading.businessstation;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebResourceRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient.FileChooserParams;
import android.net.Uri;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.widget.Toast;

public class MainActivity extends Activity {
  private WebView web;
  private ValueCallback<Uri[]> uploadMessage;
  private static final int FILE_CHOOSER_REQUEST = 1001;
  private static final String SITE = "https://ronald-e-loading-retailer-business.onrender.com/retailer";

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    web = new WebView(this);
    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(true);
    settings.setAllowContentAccess(true);
    settings.setSupportMultipleWindows(false);

    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if ("https".equals(uri.getScheme()) &&
            ("ronald-e-loading-retailer-business.onrender.com".equals(uri.getHost()) ||
             "ronaldeloadingbusinessstation.github.io".equals(uri.getHost()))) return false;
        startActivity(new Intent(Intent.ACTION_VIEW, uri));
        return true;
      }
    });

    web.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView webView,
          ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
        // Cancel any unfinished chooser request before starting a new one.
        if (uploadMessage != null) {
          uploadMessage.onReceiveValue(null);
        }
        uploadMessage = filePathCallback;

        Intent chooserIntent = null;
        try {
          // First try Android's intent recommended by WebView.
          if (fileChooserParams != null) {
            try { chooserIntent = fileChooserParams.createIntent(); }
            catch (RuntimeException ignored) { chooserIntent = null; }
          }
          // Fallback for devices/file managers that don't handle the WebView intent.
          if (chooserIntent == null) {
            chooserIntent = new Intent(Intent.ACTION_GET_CONTENT);
            chooserIntent.setType("image/*");
            chooserIntent.addCategory(Intent.CATEGORY_OPENABLE);
          }
          // Always wrap it so the customer can choose Files, Photos, or another provider.
          Intent chooser = Intent.createChooser(chooserIntent, "Pumili ng payment receipt");
          startActivityForResult(chooser, FILE_CHOOSER_REQUEST);
          return true;
        } catch (ActivityNotFoundException | RuntimeException e) {
          if (uploadMessage != null) {
            uploadMessage.onReceiveValue(null);
            uploadMessage = null;
          }
          Toast.makeText(MainActivity.this,
              "Walang file picker na available sa phone. Subukan ang Files/Photos app.",
              Toast.LENGTH_LONG).show();
          return false;
        }
      }
    });
    setContentView(web);
    web.loadUrl(SITE);
  }

  @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode == FILE_CHOOSER_REQUEST) {
      if (uploadMessage == null) return;
      Uri[] results = null;
      if (resultCode == Activity.RESULT_OK && data != null) {
        if (data.getClipData() != null) {
          int count = data.getClipData().getItemCount();
          results = new Uri[count];
          for (int i = 0; i < count; i++) results[i] = data.getClipData().getItemAt(i).getUri();
        } else if (data.getData() != null) {
          results = new Uri[] { data.getData() };
        }
      }
      uploadMessage.onReceiveValue(results);
      uploadMessage = null;
    }
  }

  @Override public void onBackPressed() {
    if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
  }
}
