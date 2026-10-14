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
        if (uploadMessage != null) uploadMessage.onReceiveValue(null);
        uploadMessage = filePathCallback;

        try {
          // Use Android's system document picker directly. It supports images and documents
          // and is more reliable than relying on a third-party gallery app.
          Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
          intent.addCategory(Intent.CATEGORY_OPENABLE);
          intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
          String[] acceptTypes = fileChooserParams == null ? null : fileChooserParams.getAcceptTypes();
          String mime = "*/*";
          if (acceptTypes != null && acceptTypes.length > 0) {
            String first = acceptTypes[0];
            if (first != null && !first.trim().isEmpty() && !"*".equals(first.trim())) mime = first.trim();
          }
          intent.setType(mime);
          if (acceptTypes != null && acceptTypes.length > 1) {
            intent.putExtra(Intent.EXTRA_MIME_TYPES, acceptTypes);
            intent.setType("*/*");
          }
          startActivityForResult(intent, FILE_CHOOSER_REQUEST);
          return true;
        } catch (ActivityNotFoundException e) {
          finishFileChooser(null);
          Toast.makeText(MainActivity.this,
              "Walang Android file picker. I-update ang Files app o subukan ang ibang file manager.",
              Toast.LENGTH_LONG).show();
          return true;
        } catch (RuntimeException e) {
          finishFileChooser(null);
          Toast.makeText(MainActivity.this, "Hindi mabuksan ang file picker: " + e.getMessage(),
              Toast.LENGTH_LONG).show();
          return true;
        }
      }
    });
    setContentView(web);
    web.loadUrl(SITE);
  }

  private void finishFileChooser(Uri[] result) {
    if (uploadMessage != null) {
      uploadMessage.onReceiveValue(result);
      uploadMessage = null;
    }
  }

  @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode == FILE_CHOOSER_REQUEST) {
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
      finishFileChooser(results);
    }
  }

  @Override public void onBackPressed() {
    if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
  }
}
