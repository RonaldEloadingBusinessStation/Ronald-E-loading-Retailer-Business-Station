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
          // Launch Android's system chooser so the user can select Gallery/Photos or Files.
          Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
          intent.addCategory(Intent.CATEGORY_OPENABLE);
          intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
          String[] acceptTypes = fileChooserParams == null ? null : fileChooserParams.getAcceptTypes();
          java.util.ArrayList<String> types = new java.util.ArrayList<>();
          if (acceptTypes != null) {
            for (String type : acceptTypes) {
              if (type != null && !type.trim().isEmpty() && !types.contains(type.trim())) types.add(type.trim());
            }
          }
          if (types.isEmpty()) {
            intent.setType("image/*");
          } else if (types.size() == 1) {
            intent.setType(types.get(0));
          } else {
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
          }
          if (fileChooserParams != null && fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
          }
          startActivityForResult(Intent.createChooser(intent, "Pumili ng larawan o file"), FILE_CHOOSER_REQUEST);
          return true;
        } catch (ActivityNotFoundException e) {
          try {
            Intent fallback = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            fallback.addCategory(Intent.CATEGORY_OPENABLE);
            fallback.setType("image/*");
            startActivityForResult(fallback, FILE_CHOOSER_REQUEST);
            return true;
          } catch (RuntimeException ignored) {
            finishFileChooser(null);
            Toast.makeText(MainActivity.this, "Walang mabuksang Gallery o Files app sa phone.", Toast.LENGTH_LONG).show();
            return true;
          }
        } catch (RuntimeException e) {
          finishFileChooser(null);
          Toast.makeText(MainActivity.this, "Hindi mabuksan ang Gallery/Files: " + e.getMessage(), Toast.LENGTH_LONG).show();
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
