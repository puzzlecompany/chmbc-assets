
function load_video_on_playlist($videoWrap) {
		if (!$videoWrap) {
				$videoWrap = $(".main_playlist li.active").closest('.site-content');
		} else if (typeof $videoWrap === 'string') {
				/* callers pass the selector ".main_playlist li.active" – wrap it (original threw "$videoWrap.find is not a function") */
				$videoWrap = $($videoWrap).closest('.site-content');
		}
		
		var $mainPlaylistMainwrap = $videoWrap.find('.main_playlist_mainwrap');
		var $activeLi = $videoWrap.find('.main_playlist li.active');
		
		if (!$mainPlaylistMainwrap.find('.do_not_ready').length) {
				$mainPlaylistMainwrap.html('');
				$mainPlaylistMainwrap.append('<video id="main_playlist-player"></video>'); 
		}
		
		var title = $activeLi.data("title");
		var link = "";
		if ($activeLi.data("articleuniqueid") !== "" && $activeLi.data("articleuniqueid") !== " ") {
				var link = '<a href="/article/'+$activeLi.data("articleuniqueid")+'" alt="'+title+'" title="'+title+'"><i class="fas fa-link"></i> 기사이동</a>';
		}
		
		$mainPlaylistMainwrap.append('<div class="main_play_meta"><h3>'+title+' <small class="ml-2">'+link+'</small></h3><p>'+$activeLi.data("datetime")+'</p></div>');

		var currentUrl = window.location.href;
		var currentHost = currentUrl.split('?')[0];
		if (typeof $activeLi.data("id") !== 'undefined') {
				window.history.pushState('', document.title, currentHost+'?target='+$activeLi.data("id"));  
		} 

		var autoplay_status = false;
		if (typeof $videoWrap.find(".autoplay").data("autoplay") !== 'undefined' && $videoWrap.find(".autoplay").data("autoplay") == "Y") {
				autoplay_status = true;	
		}
		
		var youtubeId = $activeLi.data("youtubeid");
		var playerId = '#main_playlist-player';
		
		if (youtubeId && youtubeId.length > 3) {
				new Plyr(playerId, {autostart: false}).source = {
						type: 'video',
						autoplay: autoplay_status,
						ownyoutube: true,
						sources: [{ src: youtubeId, provider: 'youtube' }],
						poster: $activeLi.data("img")
				}; 
		} else {
				var video_url_del = $activeLi.data("1080");
				new Plyr(playerId, {autostart: false}).source = {
						type: 'video',
						title: $activeLi.data("title"),
						autoplay: autoplay_status,
						sources: [{ src: video_url_del, type: 'video/mp4', size: 1080 }],
						poster: $activeLi.data("img")
				}; 
				
				$(playerId).on('ended', function(){
						autoplay_avec_playlist($videoWrap);
				});	
		}
		
}

function autoplay_avec_playlist($videoWrap) {
		if ($videoWrap.find(".autoplay").data("autoplay") == "Y") {
				$videoWrap.find(".main_playlist li.active").next().addClass("pre_active");
				$videoWrap.find(".main_playlist li.active").removeClass("active");
				$videoWrap.find(".main_playlist li.pre_active").addClass("active");
				$videoWrap.find(".main_playlist li.pre_active").removeClass("pre_active"); 
				setTimeout(function() {
						load_video_on_playlist($videoWrap);
				}, 100);
		}	
}

	
$(document).ready(function() {
	
	$(document).on("click", ".run_videoplay", function(e) {
		
		$(".main_playlist_mainwrap").html('');
		$(".main_playlist_mainwrap").append('<video id="main_playlist-player"></video>'); 
		var youtubeId = $(this).data("youtubeid");

		setTimeout( function() {
			if (youtubeId.length > 3) {
				 
				new Plyr('#main_playlist-player').source = {
				    type: 'video',
				    autoplay: true,
				    ownyoutube: true,
				    sources: [
				        {
				            src: youtubeId,
				            provider: 'youtube',
				        },
				    ],
				    poster: $(this).data("img")
				}; 
			} else {
				
				
				new Plyr('#main_playlist-player').source = {
				    type: 'video',
				    title: $(this).data("title"),
				    autoplay: true,
				    sources: [
				        {
				            src: $(this).data("1080"),
				            type: 'video/mp4',
				            size: 1080,
				        }
				    ],
				    poster: $(this).data("img")
				}; 
				
				$('video').on('ended', function(){
					autoplay_avec_playlist();
				});	
			}
		}, 100);

		
	});	
	
	$(document).on("click", "a#autoplay_trigger", function(e) { 
		e.preventDefault();

		if ($(".autoplay").data("autoplay") == "Y") {
			$(".autoplay").data("autoplay", "N");
			$(".autoplay").removeClass("active");
		} else {
			$(".autoplay").data("autoplay", "Y");
			$(".autoplay").addClass("active");
		}		 
	});	

	$(document).on("click", "ul.main_playlist li", function(e) {	
			e.preventDefault();
	
			var $thisVideoWrap = $(this).closest('.site-content');
			
			$thisVideoWrap.find("ul.main_playlist li").removeClass("active"); 
			$(this).addClass("active");
			
			load_video_on_playlist($thisVideoWrap);
	});

		
									
	$("[type=file].data_upload").change(function (){ 
		var name = $(this).attr('name'); 
		if($("i.fa-pulse").is(':visible')){ 
			swal("기존의 업로드 작업이 완료된 후 새로운 업로드 작업을 진행해 주시기 바랍니다. ", { buttons: [false, "확인"], });
			$("[name="+name+"]").val("");
			return;
		}
		$("i."+name).show();
	    data = new FormData();
	    data.append("editorFile", this.files[0]); 
		$("#loading").show();
	    $.ajax({
			data: data,
			type: "POST",
			url: "/data_upload",
			cache: false,
			contentType: false,
			processData: false,
			success: function(data) {
	        	$("i."+name).hide(); 
				var obj =  JSON.parse(data);
				if (obj.status) {
					$("img."+name).attr("src", obj.save_url);
					$("[name="+name+"]").val("");
				} else {
					switch(parseInt(obj.error)) {
						case 1: alert('업로드 용량 제한에 걸렸습니다.'); break; 
						case 2: alert('3MB 보다 큰 파일은 업로드할 수 없습니다.'); break;
						case 3: alert('파일이 일부분만 전송되었습니다.'); break;
						case 4: alert('파일이 전송되지 않았습니다.'); break;
						case 6: alert('임시 폴더가 없습니다.'); break;
						case 7: alert('파일 쓰기 실패'); break;
						case 8: alert('알수 없는 오류입니다. 용량을 확인해 주시기 바랍니다. 2메가 이상은 올릴 수 없습니다.'); break;
						case 100: alert('이미지 파일이 아닙니다.(jpeg, jpg, gif, png 만 올리실 수 있습니다.)'); break; 
						case 101: alert('이미지 파일이 아닙니다.(jpeg, jpg, gif, png 만 올리실 수 있습니다.)'); break; 
						case 102: alert('0 byte 파일은 업로드 할 수 없습니다.'); break; 
					}
				}
			}
		}); 
		
	});

	//
/*
	$('a[data-toggle=pill]').on('shown.bs.tab', function (e) {
		$("#new_comment_wrap").empty();
		var target = $(e.target).attr("href");
		
		if (target == "#pills-signup") {
			var formData = new FormData(); 
			formData.append("action", "signup_policies");  
			formData.append(csrf_key, csrf_value); 
			$.ajax({
			    url: ajax_url,
        	    data: formData,
        	    cache: false,
        	    processData: false,
        	    contentType: false,
        	    type: 'POST',
		        success: function(data) {
				    var obj = JSON.parse(data);
					if (obj.status) { 
						
						$("#new_comment_wrap").append(obj.result);
					} else {
						swal(obj.msg, { buttons: [false, "확인"], });
					}
				}
			});
		}
	});
*/
	
	// Navigation Bar Show on Scroll Up for PC and to the top ㅇㅇ
    var previousScroll = 0;

    $(window).scroll(function() {

        var currentScroll = $(this).scrollTop();
        if (currentScroll > 0 && currentScroll < $(document).height() - $(window).height()) {
            if (currentScroll > previousScroll) {
                window.setTimeout(hideNav, 300);
            } else {
                window.setTimeout(showNav, 300);
            }
            
            previousScroll = currentScroll;
        }

    }); 
    function hideNav() {
        $("#mnmd-sticky-header").addClass("is-shown").addClass("is-fixed");
        $("a.js-go-top-el").addClass("is-active");
    }

    function showNav() {
        $("#mnmd-sticky-header").removeClass("is-shown").removeClass("is-fixed");
        $("a.js-go-top-el").removeClass("is-active");
    }
    
	if ($('.js-go-top-el').length) {
		$('.js-go-top-el').on('click', function() {
			$('html,body').stop(true).animate({scrollTop:0},400);
			return false;
		});
	}
	// Offcanvas Menu
	$('.js-perfect-scrollbar').perfectScrollbar({
		wheelPropagation: true,
	});
	
	var $backdrop = $('<div class="mnmd-offcanvas-backdrop"></div>'); 
	
	$backdrop.on('click', function(){
		$('.js-mnmd-offcanvas').removeClass('is-active');
		$(this).fadeOut(200, function(){
			$(this).detach();
		});
	});
	
	$('.js-mnmd-offcanvas-toggle').on('click', function(e){
		e.preventDefault();
		var targetID = $(this).attr('href');
		var $target = $(targetID);
		$target.toggleClass('is-active');
		$backdrop.hide().appendTo(document.body).fadeIn(200);
	});
	
	$('.js-mnmd-offcanvas-close').on('click', function(e){
	
		e.preventDefault();
		var targetID = $(this).attr('href');
		var $target = $(targetID);
		$('.js-mnmd-offcanvas').removeClass('is-active');
		$backdrop.fadeOut(200, function(){
			$(this).detach();
		});
	});
	
	$('.navigation--offcanvas').find('li.menu-item-has-children > a').append(function() {
		return $('<div class="submenu-toggle"><i class="fas fa-angle-down"></i></div>').on('click', function(e){
			e.preventDefault();
			var $subMenu = $(this).parent().siblings('.sub-menu');
			$subMenu.slideToggle(200);
		});
	});  
	// Search
	$('#header-search-dropdown').on('click', function(e) {
		e.stopPropagation();
	});
	
	$('.js-search-dropdown-toggle').on('click', function(e) {
		e.stopPropagation();
		var $toggleBtn = $(this);
		var position = '';
		
	
		if ($toggleBtn.hasClass('mobile-header-btn')) {
			position = 'mobile';
		} else if ($toggleBtn.parents('.sticky-header').length) {
			position = 'sticky';
		} else {
			position = 'navbar';
		}
	
		if ($('#header-search-dropdown').hasClass('is-in-' + position) || !$('#header-search-dropdown').hasClass('is-active')) {
			$('#header-search-dropdown').toggleClass('is-active');
		}
	
		switch(position) {
			case 'mobile':
				if (!$('#header-search-dropdown').hasClass('is-in-mobile')) {
					$('#header-search-dropdown').addClass('is-in-mobile');
					$('#header-search-dropdown').removeClass('is-in-sticky');
					$('#header-search-dropdown').removeClass('is-in-navbar');
					$('#header-search-dropdown').appendTo($('#mnmd-mobile-header'));
				}
				break;
	
			case 'sticky':
				if (!$('#header-search-dropdown').hasClass('is-in-sticky')) {
					$('#header-search-dropdown').addClass('is-in-sticky');
					$('#header-search-dropdown').removeClass('is-in-mobile');
					$('#header-search-dropdown').removeClass('is-in-navbar');
					$('#header-search-dropdown').insertAfter($('#mnmd-sticky-header').find('.navigation-bar__inner'));
				}
				break;
	
			default:
				if (!$('#header-search-dropdown').hasClass('is-in-navbar')) {
					$('#header-search-dropdown').addClass('is-in-navbar');
					$('#header-search-dropdown').removeClass('is-in-sticky');
					$('#header-search-dropdown').removeClass('is-in-mobile');
					$('#header-search-dropdown').insertAfter($('.site-header').find('.navigation-bar__inner'));
				}
		}
		
		if ($('#header-search-dropdown').hasClass('is-active')) {
			setTimeout(function () {
			    $('#header-search-dropdown').find('.search-form__input').focus();
			}, 200);
		}
	});
	
	$(document).on('click', function() {
	    $('#header-search-dropdown').removeClass('is-active');
	});
	
	$(window).on('stickyHeaderHidden', function(){
		if ($('#header-search-dropdown').hasClass('is-in-sticky')) {
			$('#header-search-dropdown').removeClass('is-active');
		}
	});	

});

function goBack(){
	window.history.back();
	
}
function goMain(){
	window.location.href = "[url]";
	
}
function goTop(){
	window.location.href = ".site-header";
	
}
function goFoot(){
	window.location.href = "#theme1";
	
}
function goContent(){
	window.location.href = "#content";
	
}

